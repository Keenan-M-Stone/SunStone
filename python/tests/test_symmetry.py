import sys, os
# ensure local package is importable during tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import numpy as np
from sunstone_bundle import symmetry


def test_invariant_basis_identity_rank2():
    # identity only -> all components allowed -> basis size = 9
    I = np.eye(3)
    basis, n = symmetry.invariant_tensor_basis([I], rank=2)
    assert n == 9


def test_project_and_invariance_rank2():
    # symmetry: 180 deg about z axis -> R = diag(-1,-1,1)
    R = np.diag([-1.0, -1.0, 1.0])
    basis, n = symmetry.invariant_tensor_basis([R], rank=2)
    # basis dimension should be smaller than 9
    assert n < 9

    # create random symmetric tensor and project
    T = np.random.RandomState(0).randn(3, 3)
    T = 0.5 * (T + T.T)
    v = symmetry.project_to_invariant(T, basis)
    # reshape and check invariance R T R^T == T_proj (numerical)
    Tproj = v.reshape(3, 3)
    Trot = R @ Tproj @ R.T
    assert np.allclose(Trot, Tproj, atol=1e-6)


def test_suggest_layered():
    # target diagonal tensor slightly anisotropic
    target = np.array([2.5, 2.0, 2.0])
    f = symmetry.suggest_layered_composite_for_diagonal(target, eps_incl=10.0, eps_host=1.0)
    assert f.shape == (3,)
    assert np.all((f >= 0.0) & (f < 1.0))
