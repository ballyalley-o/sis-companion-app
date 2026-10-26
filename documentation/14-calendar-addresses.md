# Calendar destination addresses

Trips have a separate optional `address` field alongside the existing site/project name. Create and edit forms preserve it, and the calendar and trip detail display a clickable address. The detail and edit forms also provide driving directions.

The links use Google's universal Maps URLs with `api=1` and URL-encoded address/destination values. They open a separate browser tab on the web or the platform's map/browser handler on mobile. Clicking an address within a calendar card opens its map without also opening the trip details. Empty addresses render no map actions. Existing trips without an address remain compatible.

This implementation needs no API key, billing account, Places integration or geocoding service. Users type the address themselves. Address text is sent to Google only when a user chooses a Maps or directions link; typing and saving a trip do not call Google.

Reference: [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
