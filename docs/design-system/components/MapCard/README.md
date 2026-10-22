# MapCard

A small location preview for the assembly place: a 140-high map, a `primary` pin, the place name and address, and a text button "Cómo llegar".

- **Only when the assembly has a location** (an address that geocodes, or coordinates). With a free-text place only ("Salón de actos"), show the `Lugar` line and no map — never an empty or guessed map.
- In the app it is a static map snapshot (`react-native-maps` in lite mode on Android / a non-interactive `MapView` on iOS, or a static image on web), so it does not steal scroll. Tapping the map or "Cómo llegar" opens the native maps app (Apple Maps / Google Maps) with the address.
- The artwork here is a generic stand-in drawn from tokens (`surface-variant` ground, `border` roads, `primary-container` park, `primary` pin); real tiles replace it. Keep `radius-md` and the `border` frame so it reads as one card.
- Place it directly under the date/place facts of the assembly detail, before "Orden del día". If the place changes ("Fecha cambiada el …"), the map shows the new place only.
- Accessible label on the map: "Ver {lugar} en el mapa".

The consumer provides: `place`, optional `address`, `onPress`.
