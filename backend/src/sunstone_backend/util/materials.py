from __future__ import annotations

from typing import Any


def normalize_materials(materials_raw: Any) -> dict:
    """Normalize materials into a mapping name -> info dict.

    Accepts either a dict mapping or a list of material dicts used by older
    bundle formats. This function NORMALIZES names only and canonicalizes
    common key names ("type" -> "model", "epsilon" -> "eps") but
    otherwise makes no structural changes to the info dict values.
    The function is explicitly non-destructive: it does NOT coerce numeric
    values or parse complex/tensor structures; those remain as provided so
    backends can implement appropriate parsing/handling.
    """
    if isinstance(materials_raw, list):
        materials: dict[str, dict] = {}
        for m in materials_raw:
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or m.get("id") or "").strip()
            if not name:
                continue
            info = dict(m)  # shallow copy
            # normalize commonly-used key names without coercion
            if "type" in info and "model" not in info:
                info["model"] = info.get("type")
            if "epsilon" in info and "eps" not in info:
                info["eps"] = info.get("epsilon")
            materials[name] = info
        return materials
    if isinstance(materials_raw, dict):
        return materials_raw
    return {}


# Parsing helpers for backend-specific interpretation
def fit_drude_to_spectrum(freqs_hz, eps_targets, initial_guess=None, maxiter=200):
    """Fit a simple Drude model eps(omega) = eps_inf - wp^2/(omega^2 + i*gamma*omega)
    to complex target permittivities sampled at frequencies `freqs_hz`.

    Uses a simple Levenberg-Marquardt (Gauss-Newton with damping) using finite
    differences for the Jacobian. Returns dict {eps_inf, wp, gamma}.
    """
    import numpy as np

    omegas = 2 * np.pi * np.asarray(freqs_hz, dtype=float)
    y = np.asarray(eps_targets, dtype=complex)

    # Initial guess: eps_inf ~ real(y[0]) (clamped), wp ~ omega*sqrt(|eps_inf - y|), gamma ~ 0.05*omega
    if initial_guess is None:
        eps_inf0 = max(1.0, float(np.real(y[0])))
        omega0 = float(omegas[len(omegas) // 2]) if len(omegas) > 0 else 2 * np.pi * 3.75e14
        wp0 = float(abs(eps_inf0 - y[0]) ** 0.5 * omega0)
        gamma0 = max(omega0 * 0.05, 1e12)
        p = np.array([eps_inf0, wp0, gamma0], dtype=float)
    else:
        p = np.asarray(initial_guess, dtype=float)

    def model(p):
        eps_inf, wp, gamma = p
        denom = omegas ** 2 + 1j * gamma * omegas
        return eps_inf - (wp ** 2) / denom

    def residual(p):
        return np.concatenate([np.real(model(p) - y), np.imag(model(p) - y)])

    lam = 1e-3
    best_p = p.copy()
    best_err = np.linalg.norm(residual(best_p))

    for _ in range(maxiter):
        # numeric jacobian
        J = np.zeros((2 * y.size, 3), dtype=float)
        f0 = model(p)
        eps = 1e-6
        for i in range(3):
            dp = np.zeros_like(p)
            dp[i] = max(1e-8, eps * abs(p[i]) if p[i] != 0 else eps)
            f1 = model(p + dp)
            deriv = (f1 - f0) / dp[i]
            J[: y.size, i] = np.real(deriv)
            J[y.size :, i] = np.imag(deriv)
        r = residual(p)
        A = J.T @ J
        g = J.T @ r
        # LM step
        try:
            diag = np.diag(np.diag(A))
            delta = np.linalg.solve(A + lam * diag, g)
        except np.linalg.LinAlgError:
            lam *= 10
            continue
        p_new = p - delta
        # enforce positivity on wp and gamma
        p_new[1] = max(0.0, p_new[1])
        p_new[2] = max(1e-12, p_new[2])
        err_new = np.linalg.norm(residual(p_new))
        if err_new < best_err:
            best_err = err_new
            p = p_new
            best_p = p_new.copy()
            lam = max(lam * 0.1, 1e-12)
            # convergence
            if np.linalg.norm(delta) < 1e-6:
                break
        else:
            lam *= 10
    return {"eps_inf": float(best_p[0]), "wp": float(best_p[1]), "gamma": float(best_p[2])}


def approximate_drude_from_complex(eps_complex: complex, center_freq_hz: float | None = None) -> dict:
    """Create a **very simple** Drude model approximation for a complex
    permittivity measured at a single frequency (center_freq_hz).

    This is heuristic. The goal is to provide a reasonable dispersive model
    so Meep can run rather than to provide rigorous material fits.

    Returned dict has fields: {'eps_inf': float, 'wp': float, 'gamma': float, 'sigma': float}
    """
    # Default behaviour: if caller provided a spectrum for fitting, prefer the fit
    params = fit_drude_to_spectrum([center_freq_hz or 3.75e14], [eps_complex])
    # add a convenience 'sigma' (Drude strength) for compatibility with earlier code
    wp = params.get('wp', 0.0)
    params['sigma'] = float(wp ** 2)
    return params


def parse_epsilon_for_meep(info: dict):
    """Interpret material info and return an object usable by Meep.

    Supported forms:
    - scalar eps: number (int/float) -> return float
    - complex scalar: {'real':..., 'imag':...} or string 'a+bj' -> complex
    - tensor: 'eps_tensor': [[...]] -> if diagonal, return ('diag', (ex,ey,ez))

    If a complex scalar is provided and `info.get("approximate_complex") is True`,
    return ("drude_approx", params) where params is the dict returned by
    `approximate_drude_from_complex`.

    Raises ValueError for unsupported or malformed structures.
    """
    if not isinstance(info, dict):
        raise ValueError("material info must be a dict")

    # Direct scalar
    eps = info.get("eps")
    if isinstance(eps, (int, float)):
        return float(eps)

    # Complex scalar encoded as dict
    if isinstance(eps, dict) and "real" in eps and "imag" in eps:
        try:
            real = float(eps.get("real", 0.0))
            imag = float(eps.get("imag", 0.0))
            eps_c = complex(real, imag)
            # If the caller provided a full dispersion_fit, use least-squares fit
            df = info.get("dispersion_fit")
            if df:
                freqs = df.get("freqs") or df.get("frequencies")
                eps_vals = df.get("eps_values") or df.get("eps")
                if freqs and eps_vals and len(freqs) == len(eps_vals):
                    # parse eps_vals into complex numbers
                    parsed = []
                    for v in eps_vals:
                        if isinstance(v, str):
                            parsed.append(complex(v))
                        elif isinstance(v, dict) and "real" in v and "imag" in v:
                            parsed.append(complex(float(v.get("real")), float(v.get("imag"))))
                        else:
                            parsed.append(complex(v))
                    params = fit_drude_to_spectrum(freqs, parsed)
                    params["sigma"] = float(params.get("wp", 0.0) ** 2)
                    return ("drude_approx", params)
            if info.get("approximate_complex"):
                # Use source center_freq if available else default inside helper
                center_freq = info.get("center_freq")
                return ("drude_approx", approximate_drude_from_complex(eps_c, center_freq))
            return eps_c
        except Exception:
            raise ValueError("Invalid complex epsilon dict")

    # Complex scalar encoded as string
    if isinstance(eps, str):
        try:
            eps_c = complex(eps)
            df = info.get("dispersion_fit")
            if df:
                freqs = df.get("freqs") or df.get("frequencies")
                eps_vals = df.get("eps_values") or df.get("eps")
                if freqs and eps_vals and len(freqs) == len(eps_vals):
                    parsed = []
                    for v in eps_vals:
                        if isinstance(v, str):
                            parsed.append(complex(v))
                        elif isinstance(v, dict) and "real" in v and "imag" in v:
                            parsed.append(complex(float(v.get("real")), float(v.get("imag"))))
                        else:
                            parsed.append(complex(v))
                    params = fit_drude_to_spectrum(freqs, parsed)
                    params["sigma"] = float(params.get("wp", 0.0) ** 2)
                    return ("drude_approx", params)
            if info.get("approximate_complex"):
                center_freq = info.get("center_freq")
                return ("drude_approx", approximate_drude_from_complex(eps_c, center_freq))
            return eps_c
        except Exception:
            raise ValueError("Invalid complex epsilon string")
    # Diagonal tensor
    tensor = info.get("eps_tensor") or info.get("epsilon_tensor")
    if tensor is not None:
        if isinstance(tensor, list) and len(tensor) == 3 and all(isinstance(r, list) and len(r) == 3 for r in tensor):
            # check diagonal
            ex = tensor[0][0]
            ey = tensor[1][1]
            ez = tensor[2][2]
            off_diag = sum(abs(tensor[i][j]) for i in range(3) for j in range(3) if i != j)
            if off_diag != 0:
                raise ValueError("Non-diagonal eps_tensor not supported by Meep parser")
            return ("diag", (float(ex), float(ey), float(ez)))
        else:
            raise ValueError("Malformed eps_tensor; expected 3x3 nested lists")

    # Last resort: try to coerce numeric-like eps if present under other keys
    if isinstance(eps, (int, float)):
        return float(eps)

    # No supported epsilon found: return default 1.0
    return 1.0
