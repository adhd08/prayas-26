"""Domain failures suitable for worker job errors and CLI diagnostics."""


class PathwayError(ValueError):
    """Base class for invalid or infeasible pathway evaluation requests."""


class GraphError(PathwayError):
    """A graph has duplicate IDs, unknown references, or invalid topology."""


class ConstraintError(PathwayError):
    """A selected design violates protection or construction constraints."""


class NumericalError(PathwayError):
    """A calculation exceeded the supported finite numeric range."""
