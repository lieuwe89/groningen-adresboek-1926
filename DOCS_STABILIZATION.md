# Project Stabilization & Data Normalization (May 2026)

This document summarizes the changes made to stabilize the Groningen Adresboek 1926 application, focusing on navigation, automated geocoding, and historical data normalization.

## 1. Document Navigation Stabilization
Resolved critical race conditions in the `Viewer` component that caused incorrect bounding box jumps during page transitions.
- **Immediate State Sync**: Implemented a `syncedStem` local state in `Viewer` to ensure the correct entry is highlighted on the very first frame of a new page.
- **React Warning Fixes**: Moved context updates (`setActiveIdx`) into effects to prevent the "Cannot update a component while rendering a different component" warning.

## 2. Automated Admin Geocoding Pipeline
Administrative edits now automatically synchronize with the map.
- **Real-time PDOK Integration**: Updating a street name or number in the Admin panel triggers a background PDOK Locatieserver lookup.
- **Database Consistency**: The system automatically clears stale building links (`pand_id`) when an address changes, preventing records from appearing at old locations.
- **UI Feedback**: Added status indicators (e.g., "📍 Locatie bijgewerkt") to the `EditForm`.

## 3. Historical Data Normalization
Implemented a robust normalization engine in `web/lib/geocode.ts` to translate 1920s address notation into modern PDOK-compatible queries.
- **Street Name Aliases**:
    - *Verloren* → *Verlengde*
    - *Heereweg* → *Hereweg*
    - *A-Kerk* / *A-Kerkhof* → *Akerkhof*
    - *Visscherstraat* → *Visserstraat*
- **Pattern Handling**: Automatically handles parenthetical suffixes like *Heereweg (verlengde)*.
- **Unicode Superscripts**: Implemented support for historical unit digits (e.g., `22¹`, `22²`).

## 4. Data Quality Improvements
- **Bulk Correction**: Executed a mass re-normalization and re-geocoding pass for 4,000+ entries.
- **Ghost Record Removal**: Unlinked hundreds of records from "garbage collector" buildings in the city center where modern PDOK matching had created false positives.
- **Spatial Linking**: Re-ran the point-in-polygon linker to ensure corrected coordinates are visually tied to 1920s building footprints.

## 5. Usage
- **Normalization**: Rules are maintained in `web/lib/geocode.ts`. Add new aliases there if specific streets fail to geocode.
- **Admin**: Simply edit an address in the Admin view to trigger a re-geocode.
