from sunstone_backend.backends.registry import list_backends, get_backend


def test_backends_listed():
    backends = list_backends()
    assert 'dummy' in backends
    assert 'meep' in backends
    assert 'opal' in backends
    assert 'ceviche' in backends
    assert 'scuffem' in backends
    assert 'pygdm' in backends


def test_get_backend_instances():
    for name in ['dummy', 'meep', 'opal', 'ceviche', 'scuffem', 'pygdm']:
        be = get_backend(name)
        assert be.name == name
        # Ensure run_dir contract is callable (we won't execute run here)
        assert hasattr(be, 'run')
