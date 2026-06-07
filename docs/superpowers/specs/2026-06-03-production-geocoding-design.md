# Production Geocoding Design

## Goal

Define when and how to move beyond MVP save-time Nominatim geocoding for matching profile locations.

## Current Context

The matching profile form offers fixed MVP city selections that submit known coordinates directly. Custom free-text locations are geocoded at save time. Public Nominatim is acceptable for local and low-volume MVP usage, but not for high-volume autocomplete or production-scale traffic.

## Recommended Approach

Keep the current fixed-location selection for launch. Add a production geocoding provider only when custom-location volume or geographic coverage requires it. Do not add public Nominatim autocomplete.

## Provider Requirements

Any provider must support:

- HTTPS API.
- Server-side requests.
- Clear usage limits suitable for production.
- Stable display text and latitude/longitude.
- Country or region filtering.
- Terms that allow the app's use case.

Examples include paid geocoding providers or a self-hosted Nominatim instance. Provider choice is an operational decision and should be validated before implementation.

## Application Behavior

Launch behavior:

- Users choose from fixed MVP locations.
- Users can enter a custom city/town.
- Custom text geocodes at save time.
- If geocoding fails, no profile mutation occurs and the user sees clear error copy.
- Matching score remains unchanged by distance.

Future provider behavior:

- Server-side API route performs search or geocoding.
- Client uses debounced autocomplete only against the app's own API route.
- Selected result stores display text and coordinates.
- Re-saving unchanged location reuses cached coordinates.

## Data Model

No immediate schema change is needed. Existing fields remain:

- `profiles.location_text`
- `profiles.location_latitude`
- `profiles.location_longitude`
- `profiles.location_geocoded_at`

Optional future additions:

- `profiles.location_provider`
- `profiles.location_place_id`

## Testing

- Unit test selected coordinates bypass provider calls.
- Unit test custom text calls provider at save time.
- Unit test failed geocoding does not mutate profile state.
- Unit test cached coordinates are reused.
- Provider adapter tests with recorded fixtures if a paid provider is added.

## Launch Criteria

- Current MVP fixed-location flow remains in place.
- Public Nominatim is not used for autocomplete.
- Provider migration happens only after volume or coverage requires it.
