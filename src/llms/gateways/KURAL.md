One file per AI gateway plus the shared registry and plumbing every
adapter reuses — each adapter turns a gateway's catalog JSON into
the canonical CatalogEntry shape its caller consumes. It is the only
directory where per-gateway URL paths, field renames, and auth
policies live — their shape never leaks into the resolver.
