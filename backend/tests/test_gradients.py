from sunstone_backend.util.gradients import sample_gradient, discretize_gradient_over_block


def test_linear_gradient_scalar():
    mat = {
        'gradient': {'type': 'linear', 'direction': [1,0,0], 'range': 2.0},
        'eps': {'start': 1.0, 'end': 4.0}
    }
    # at center (range/2) should be ~ mid value
    val = sample_gradient(mat, (0.5, 0, 0), geom_center=(0,0,0))
    assert 1.0 <= val['eps'] <= 4.0


def test_radial_gradient_tensor():
    mat = {
        'gradient': {'type': 'radial', 'radius': 2.0},
        'eps': {'start': [[1,0,0],[0,1,0],[0,0,1]], 'end': [[2,0,0],[0,2,0],[0,0,2]]}
    }
    # at r = 1.0 should be halfway
    val = sample_gradient(mat, (1.0, 0, 0), geom_center=(0,0,0))
    eps = val['eps']
    assert abs(eps[0][0] - 1.5) < 1e-6


def test_discretize_slices_count():
    mat = {
        'gradient': {'type': 'linear', 'direction': [1,0,0], 'range': 2.0},
        'eps': {'start': 1.0, 'end': 3.0}
    }
    block = {'type': 'block', 'size': [2.0, 1.0, 1.0], 'center': [0.0, 0.0, 0.0]}
    sl = discretize_gradient_over_block(mat, block, axis='x', n_slices=4)
    assert len(sl) == 4
    # check that each slice material has eps
    for s in sl:
        assert 'material' in s and 'eps' in s['material']
