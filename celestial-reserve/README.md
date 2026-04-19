# Celestial Reserve — Sph&#232;re C&#233;leste Autonome

## But
Copie autonome et s&#233;par&#233;e de la sph&#232;re interactive D3-Celestial. Cette version est enti&#232;rement locale, ne touche pas au site principal, et n'y est pas li&#233;e.

---

## Comment l'ouvrir

### 1. Installer les d&#233;pendances (une seule fois)
```bash
cd celestial-reserve
npm install
```

### 2. Lancer le serveur
```bash
npm start
```

### 3. Ouvrir dans le navigateur
```
http://localhost:3002
```

---

## Contr&#244;les

| Action | Interaction |
|--------|-------------|
| Rotation | Clic gauche + faire glisser |
| Zoom | Roulette de la souris |
| Pan | Clic droit + faire glisser |

## Boutons

- **Vue par d&#233;faut** — r&#233;initialise la vue
- **Afficher/Masquer constellations** — active ou d&#233;sactive les lignes de constellations
- **Afficher/Masquer Voie lact&#233;e** — active ou d&#233;sactive la Voie lact&#233;e
- **Afficher/Masquer &#233;cliptique** — active ou d&#233;sactive la ligne de l'&#233;cliptique
- **Afficher/Masquer log** — affiche/masque la console de d&#233;bogage

---

## Fichiers inclus (locaux, aucune d&#233;pendance externe)

```
celestial-reserve/
&#x2523;&#x2501; public/
&#x250F;   index.html          # Page principale
&#x250F;   celestial/
&#x250F;   &#x2501; celestial.min.js  # Librairie D3-Celestial
&#x250F;   &#x2501; celestial.css     # Styles
&#x250F;   &#x2501; data/             # Donn&#233;es astronomiques (&#x233;toiles, constellations, etc.)
&#x250F;   d3-lib/
&#x250F;       d3.min.js         # D3.js
&#x250F; server.js               # Serveur Express
&#x250F; package.json
README.md
```

---

## Ce qui vient d'Internet
**Rien.** Tous les fichiers sont embarqu&#233;s localement :
- `d3.min.js` — copi&#233; depuis `node_modules/d3-celestial/lib/`
- `celestial.min.js` — copi&#233; depuis `node_modules/d3-celestial/`
- `celestial.css` — copi&#233; depuis `node_modules/d3-celestial/`
- Tous les fichiers `data/*.json` — copi&#233;s depuis `node_modules/d3-celestial/data/`

---

## Relation avec le site principal

- **Ne modifie rien** dans le site Sky Store
- **Ne remplace rien** dans `/create-map` ni ailleurs
- **Ne touche pas** aux routes, templates, ou services du serveur principal
- Fonctionne **entièrement ind&#233;pendamment** sur le port 3002

C'est une r&#233;serve — un backup fonctionnel s&#233;par&#233;.
