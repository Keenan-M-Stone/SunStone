from __future__ import annotations

import os
import platform
import re
import subprocess
from dataclasses import asdict, dataclass

import psutil

from .util.time import utc_now_iso


@dataclass(frozen=True)
class CpuInfo:
    logical_cores: int
    ram_bytes: int


@dataclass(frozen=True)
class GpuInfo:
    vendor: str
    name: str | None
    vram_bytes: int | None
    details: dict


@dataclass(frozen=True)
class EnvironmentInfo:
    detected_at: str
    os: str
    platform: str
    is_wsl: bool
    cpu: CpuInfo
    gpu: GpuInfo | None


def _is_wsl() -> bool:
    return "WSL_DISTRO_NAME" in os.environ or "microsoft" in platform.release().lower()


def detect_cpu() -> CpuInfo:
    return CpuInfo(logical_cores=os.cpu_count() or 1, ram_bytes=psutil.virtual_memory().total)


def _run(cmd: list[str]) -> str:
    p = subprocess.run(
        cmd,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return p.stdout.strip()


def detect_gpu() -> GpuInfo | None:
    # NVIDIA via nvidia-smi
    try:
        out = _run([
            "nvidia-smi",
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        if out:
            # Example: "NVIDIA GeForce RTX 3070, 8192"
            first = out.splitlines()[0]
            parts = [p.strip() for p in first.split(",")]
            name = parts[0] if parts else None
            vram_mb = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
            return GpuInfo(
                vendor="nvidia",
                name=name,
                vram_bytes=(vram_mb * 1024 * 1024) if vram_mb is not None else None,
                details={"raw": out},
            )
    except FileNotFoundError:
        pass

    # Fallback: try lspci (coarse)
    try:
        out = _run(["bash", "-lc", "lspci | grep -Ei 'vga|3d|display' | head -n 1"])
        if out:
            vendor = "unknown"
            if re.search(r"nvidia", out, re.I):
                vendor = "nvidia"
            elif re.search(r"amd|radeon", out, re.I):
                vendor = "amd"
            elif re.search(r"intel", out, re.I):
                vendor = "intel"
            return GpuInfo(vendor=vendor, name=out, vram_bytes=None, details={"raw": out})
    except Exception:
        return None

    return None


def detect_environment() -> dict:
    env = EnvironmentInfo(
        detected_at=utc_now_iso(),
        os=platform.system(),
        platform=platform.platform(),
        is_wsl=_is_wsl(),
        cpu=detect_cpu(),
        gpu=detect_gpu(),
    )
    return asdict(env)
