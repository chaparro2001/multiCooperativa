# VoteOption

The three large radio cards of the vote screen: "A favor", "En contra", "Abstención".

- 64 high, full width, `titleMedium`-plus label (18), radio circle on the left. Selected: 2 px `primary` border, `primary-container` fill and a filled radio — three signals, not colour alone.
- "Emitir voto" (primary, block) stays disabled until one is chosen. The native confirmation reads "Vas a votar «A favor». El voto no se puede cambiar." with "Votar" / "Revisar".
- The permanent note "La votación es consultiva y de apoyo a la asamblea presencial." sits under the options in `bodySmall` `muted`.

The consumer provides: `children`, `selected`, `onPress`.
