Holds every adapter the CLI uses to talk to an AI gateway — one file
per gateway declares its URL conventions, JSON field names, default
API-key env var, and whether its catalog call needs auth. It is the
only directory that owns gateway-specific knowledge — nothing else
in the system names a gateway's pricing or throughput field shape.
