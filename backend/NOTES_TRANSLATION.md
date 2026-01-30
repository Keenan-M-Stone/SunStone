Server-side translators
----------------------

This service exposes a server-side translation endpoint for backends that implement a translator.

Endpoints:
- POST /api/backends/{name}/translate
  - Request body: JSON spec (SunStone project spec)
  - Response: { "backend": "<name>", "translated": <object|string|null>, "warnings": [] }

Currently implemented server-side translators:
- ceviche (returns JSON payload)
- opal (returns textual stub)
- scuffem (returns JSON stub)
- pygdm (returns JSON stub)

If a backend does not implement a server translator the endpoint returns a 200 with translated=null and a warning message, or 404 if the backend is unknown.

The frontend will try the server translator first and fall back to a client-side translator when available.
