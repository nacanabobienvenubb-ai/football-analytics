const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, cfg = null, teamsInfo = null;

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: { 'content-type': opts.csv ? 'text/csv' : 'application/json' } };
  if (opts.body !== undefined) o.body = opts.csv ? opts.body : JSON.stringify(opts.body);
  let r; try { r = await fetch('/api' + path, o); } catch { throw new Error('Connexion impossible. Vérifiez votre réseau.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Erreur.'); e.code = j.code; e.status = r.status; throw e; }
  return j;
}
const crest = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; const ini = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); return `<div class="crest" style="background:hsl(${h} 60% 62%)" aria-hidden="true">${esc(ini)}</div>`; };
const dataTag = (d) => d.fictional ? `<p><span class="tag demo">Données fictives — démonstration</span></p>` : `<p class="small muted">Source : ${esc(d.source)}</p>`;
const bar = (label, a, b, max, low) => { const wa = Math.min(100, a / max * 100), wb = Math.min(100, b / max * 100); const good = (x, y) => (low ? x < y : x > y);
  return `<div class="stat"><span class="${good(a, b) ? 'lead' : ''}">${a}</span><div class="b"><i style="width:${wa}%"></i><i style="width:${wb}%"></i></div><span class="${good(b, a) ? 'lead' : ''}" style="text-align:right">${b}</span><small>${label}</small></div>`; };
const teamOpts = (sel) => teamsInfo.teams.map((x, i) => `<option${i === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
const seqHtml = (f) => `<div class="form">${f.seq.map((x) => `<span class="${x}">${x}</span>`).join('') || '—'}</div>`;
const heatSvg = (heat, H, A) => { const mx = Math.max(...heat.flat()); let c = '';
  heat.forEach((row, i) => row.forEach((v, j) => { c += `<rect x="${34 + j * 44}" y="${14 + i * 44}" width="42" height="42" rx="4" fill="#3ddc84" fill-opacity="${(0.08 + 0.85 * v / mx).toFixed(2)}"/><text x="${55 + j * 44}" y="${40 + i * 44}" text-anchor="middle" fill="${v / mx > .55 ? '#04150b' : '#e9f2ec'}" font-size="12" font-weight="700">${v}</text>`; }));
  return `<svg viewBox="0 0 260 262" role="img" aria-label="Carte de chaleur des scores probables" style="width:100%;max-width:360px"><g font-size="11" fill="#a9c0b2">${[0, 1, 2, 3, 4].map((k) => `<text x="${55 + k * 44}" y="258" text-anchor="middle">${k}</text><text x="22" y="${40 + k * 44}" text-anchor="middle">${k}</text>`).join('')}</g>${c}</svg><p class="small muted">Lignes : buts de ${esc(H)} · colonnes : buts de ${esc(A)} · valeurs en %</p>`; };
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function nav() {
  const links = [['#/', 'Accueil'], ['#/analyse', 'Analyser un match'], ['#/comparer', 'Comparer'], ['#/joueurs', 'Joueurs'], ['#/entraineurs', 'Entraîneurs']];
  if (me) links.push(['#/historique', 'Historique'], ['#/compte', 'Mon compte']);
  links.push(['#/paiement', 'Premium']);
  if (me?.role === 'admin') links.push(['#/admin', 'Administration']);
  const cur = location.hash || '#/';
  $('#nav').innerHTML = links.map(([h, t]) => `<a href="${h}" class="${cur === h ? 'on' : ''}">${t}</a>`).join('') + (me ? '<button id="out">Déconnexion</button>' : `<a href="#/connexion">Connexion</a>`);
  $('#out')?.addEventListener('click', async () => { await api('/logout', { method: 'POST', body: {} }); me = null; location.hash = '#/'; route(); });
}
$('#menuBtn').addEventListener('click', () => { const n = $('#nav'); const o = n.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); });

const pitchSvg = `<svg class="pitch" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="#e9f2ec" stroke-width="1.2"><rect x="10" y="10" width="380" height="240"/><path d="M200 10v240"/><circle cx="200" cy="130" r="32"/><rect x="10" y="75" width="55" height="110"/><rect x="335" y="75" width="55" height="110"/><path stroke="#3ddc84" stroke-width="2" stroke-dasharray="5 5" d="M80 190C120 150 150 160 190 120S270 90 330 70"/><circle cx="330" cy="70" r="5" fill="#3ddc84" stroke="none"/></svg>`;

const needsLogin = () => `<div class="wrap"><div class="card"><h2>Connexion requise</h2><p>Créez un compte gratuit pour obtenir ${cfg.free_analyses} analyses offertes.</p><a class="btn" href="#/connexion">Se connecter ou s'inscrire</a></div></div>`;

const pages = {
  async home() {
    const t = teamsInfo || {};
    return `<section class="hero">${pitchSvg}<div class="wrap"><h1>Le match avant le coup d'envoi, en chiffres.</h1><p class="lead">Probabilités de victoire, buts attendus et scores plausibles, avec le niveau de fiabilité affiché pour chaque estimation.</p><div class="row"><a class="btn" href="#/analyse">Analyser un match</a><a class="btn alt" href="#/paiement">Voir l'offre premium</a></div></div></section>
    <div class="wrap">
    ${t.fictional ? `<div class="card"><span class="tag demo">Données fictives</span><h3>Mode démonstration</h3><p class="muted">Les équipes et résultats actuellement chargés sont inventés pour montrer le fonctionnement. Aucun match réel n'est affiché tant que l'administrateur n'a pas importé de données.</p></div>` : `<div class="card"><span class="tag">${t.matches} matchs chargés</span><p class="muted small">Source : ${esc(t.source)}</p></div>`}
    <h2>Comment ça marche</h2>
    <div class="grid c3">
     <div class="card"><h3>Poisson</h3><p class="muted">Estime combien de buts chaque équipe devrait marquer, selon son attaque, la défense adverse et l'avantage du terrain. Les matchs récents pèsent plus.</p></div>
     <div class="card"><h3>Elo</h3><p class="muted">Un classement de force qui évolue après chaque résultat, utilisé pour confirmer le rapport de forces.</p></div>
     <div class="card"><h3>Fiabilité</h3><p class="muted">Chaque analyse indique la quantité de données utilisées, une marge indicative et ce que le modèle ne sait pas.</p></div></div>
    <div class="grid c2"><div class="card"><h3>${cfg.free_analyses} analyses gratuites</h3><p class="muted">Offertes à chaque nouveau compte. Les pages publiques restent accessibles ensuite.</p></div>
     <div class="card"><h3>Premium : ${esc(cfg.price_xof)} FCFA</h3><p class="muted">Soit ${esc(cfg.price_usd)} USD (conversion indicative), pour ${cfg.premium_days > 0 ? cfg.premium_days + ' jours' : 'un accès illimité'} d'analyses. Aucun renouvellement automatique.</p></div></div>
    </div>`;
  },
  async connexion() {
    return `<div class="wrap"><div class="grid c2"><form class="card" id="fl"><h2>Connexion</h2><label for="le">Email</label><input id="le" type="email" autocomplete="email" required><label for="lp">Mot de passe</label><input id="lp" type="password" autocomplete="current-password" required><div id="le1"></div><p></p><button class="btn">Se connecter</button></form>
    <form class="card" id="fr"><h2>Créer un compte</h2><label for="rn">Nom</label><input id="rn" autocomplete="name" required maxlength="60"><label for="re">Email</label><input id="re" type="email" autocomplete="email" required><label for="rp">Mot de passe (8 caractères minimum)</label><input id="rp" type="password" minlength="8" autocomplete="new-password" required><div id="re1"></div><p></p><button class="btn">Créer mon compte</button></form></div>
    <form class="card" id="fx"><h2>Mot de passe oublié</h2><p class="muted small">Demandez un code de récupération à l'administrateur du site. Il est valable 1 heure et ne sert qu'une fois.</p><label for="xe">Email</label><input id="xe" type="email" required><label for="xc">Code de récupération</label><input id="xc" required maxlength="20" autocapitalize="characters"><label for="xp">Nouveau mot de passe</label><input id="xp" type="password" minlength="8" autocomplete="new-password" required><div id="xe1"></div><p></p><button class="btn alt">Réinitialiser</button></form></div>`;
  },
  async analyse() {
    if (!me) return needsLogin();
    const t = teamsInfo; const opts = t.teams.map((x) => `<option>${esc(x)}</option>`).join('');
    return `<div class="wrap"><h2>Analyser un match</h2>${t.fictional ? '<p><span class="tag demo">Données fictives</span></p>' : ''}
    <div class="card"><p class="small muted">${me.premium ? 'Accès premium actif.' : `Analyses gratuites restantes : <strong>${me.free_left}</strong>`}</p>
    <label for="th">Équipe à domicile</label><select id="th">${opts}</select><label for="ta">Équipe à l'extérieur</label><select id="ta">${opts}</select><div id="ae"></div><p></p><button class="btn" id="go">Lancer l'analyse</button></div><div id="res"></div></div>`;
  },
  async historique() {
    if (!me) return needsLogin();
    const { items } = await api('/history');
    return `<div class="wrap"><h2>Historique</h2>${items.length ? `<div class="card scroll"><table><tr><th>Date</th><th>Match</th><th>Modèle</th><th></th></tr>${items.map((i) => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.home)} – ${esc(i.away)}</td><td>v${esc(i.model_version)}</td><td><a href="#/analyse/${i.id}">Ouvrir</a></td></tr>`).join('')}</table></div>` : '<div class="empty">Aucune analyse pour le moment.<br><a class="btn sm" href="#/analyse">Analyser un match</a></div>'}</div>`;
  },
  async compte() {
    if (!me) return needsLogin();
    return `<div class="wrap"><h2>Mon compte</h2><div class="card"><h3>${esc(me.name)}</h3><p class="muted">${esc(me.email)}</p><p>Statut : ${me.premium ? `<span class="tag">Premium (${me.premium_until === 'illimité' ? 'illimité' : 'jusqu\'au ' + new Date(me.premium_until).toLocaleDateString('fr-FR')})</span>` : '<span class="tag demo">Gratuit</span>'}</p><p>Analyses gratuites restantes : <strong>${me.free_left}</strong></p>${me.premium ? '' : '<a class="btn" href="#/paiement">Passer en premium</a>'}</div><form class="card" id="fpw"><h3>Changer de mot de passe</h3><label for="po">Mot de passe actuel</label><input id="po" type="password" autocomplete="current-password" required><label for="pn">Nouveau mot de passe</label><input id="pn" type="password" minlength="8" autocomplete="new-password" required><div id="pwe"></div><p></p><button class="btn alt">Modifier</button></form></div>`;
  },
  async paiement() {
    let mine = '';
    if (me) { const { items } = await api('/pay/mine'); const lab = { pending: 'En attente', approved: 'Validé', rejected: 'Refusé' };
      mine = items.length ? `<h3>Mes demandes</h3><div class="card scroll"><table><tr><th>Date</th><th>Moyen</th><th>Référence</th><th>Statut</th></tr>${items.map((i) => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.method)}</td><td>${esc(i.reference)}</td><td><span class="tag ${i.status === 'rejected' ? 'bad' : ''}">${lab[i.status]}</span></td></tr>`).join('')}</table></div>` : ''; }
    const m = cfg.methods.map((x) => x.id === 'orange'
      ? `<option value="orange">Orange Money — ${esc(cfg.price_xof)} FCFA</option>` : `<option value="crypto">Cryptomonnaie</option>`).join('');
    const det = cfg.methods.map((x) => x.id === 'orange'
      ? `<div class="card" data-m="orange"><h3>Orange Money (${esc(x.country)})</h3><p>Envoyez <strong>${esc(cfg.price_xof)} FCFA</strong> au numéro <strong>${esc(x.number)}</strong> depuis votre application, puis saisissez la référence reçue.</p></div>`
      : `<div class="card" data-m="crypto" hidden><h3>${esc(x.coin)} (${esc(x.network)})</h3><p>Montant : <strong>${esc(x.amount)}</strong></p><p style="word-break:break-all">Adresse : <strong>${esc(x.address)}</strong></p><p class="muted">${esc(x.instructions)}</p></div>`).join('');
    return `<div class="wrap"><h2>Accès premium</h2><div class="card"><div class="price">${esc(cfg.price_xof)} FCFA</div><p class="muted">Prix de référence : ${esc(cfg.price_usd)} USD. ${esc(cfg.conversion_note)} Durée : ${cfg.premium_days > 0 ? cfg.premium_days + ' jours' : 'illimitée'}. Aucun prélèvement automatique.</p></div>
    ${cfg.methods.length ? `<div class="card"><label for="pm">Moyen de paiement</label><select id="pm">${m}</select></div>${det}
    ${me ? `<form class="card" id="pf"><h3>J'ai payé</h3><p class="muted small">Votre accès est activé uniquement après vérification du paiement par l'administrateur. Une capture d'écran ou une déclaration ne suffit pas.</p><label for="pr">Référence de la transaction</label><input id="pr" required minlength="4" maxlength="64"><div id="pe"></div><p></p><button class="btn">Envoyer pour vérification</button></form>${mine}` : '<div class="card"><a class="btn" href="#/connexion">Connectez-vous pour envoyer une référence</a></div>'}` : '<div class="empty">Aucun moyen de paiement n\'est activé pour le moment.</div>'}</div>`;
  },
  async comparer() {
    const t = teamsInfo;
    return `<div class="wrap"><h2>Comparateur d'équipes</h2>${dataTag(t)}<div class="card"><div class="grid c2"><div><label for="ca">Équipe A</label><select id="ca">${teamOpts(0)}</select></div><div><label for="cb">Équipe B</label><select id="cb">${teamOpts(1)}</select></div></div><p></p><button class="btn" id="cgo">Comparer</button><div id="ce"></div></div><div id="cres"></div></div>`;
  },
  async joueurs() {
    const d = await api('/players'); window.__players = d.items;
    const teams = [...new Set(d.items.map((p) => p.team))].sort();
    return `<div class="wrap"><h2>Joueurs</h2>${dataTag(d)}<div class="card"><div class="grid c2"><div><label for="pt">Équipe</label><select id="pt"><option value="">Toutes</option>${teams.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div><div><label for="pq">Recherche</label><input id="pq" placeholder="Nom du joueur"></div></div></div><div class="card scroll" id="plist"></div><h3>Comparer deux joueurs</h3><div class="card"><div class="grid c2"><div><label for="pa">Joueur A</label><select id="pa"></select></div><div><label for="pb">Joueur B</label><select id="pb"></select></div></div><div id="pcmp"></div></div></div>`;
  },
  async entraineurs() {
    const d = await api('/coaches');
    return `<div class="wrap"><h2>Entraîneurs</h2>${dataTag(d)}<p class="muted small">Les résultats sont ceux des équipes dirigées. Aucune analyse tactique n'est déduite : seule une note de style fournie par la source est affichée. Pour les tendances statistiques d'une équipe, utilisez le <a href="#/comparer">comparateur</a>.</p>
    ${d.items.length ? `<div class="card scroll"><table><tr><th>Entraîneur</th><th>Équipe</th><th>Période</th><th>M</th><th>V-N-D</th><th>Pts/m</th></tr>${d.items.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.team)}</td><td>${esc(c.start_date || '—')}${c.end_date ? ' → ' + esc(c.end_date) : ''}</td><td>${c.matches}</td><td>${c.wins}-${c.draws}-${c.losses}</td><td>${c.matches ? ((3 * c.wins + c.draws) / c.matches).toFixed(2) : '—'}</td></tr>${c.style_note ? `<tr><td colspan="6" class="small muted">Note de la source : ${esc(c.style_note)}</td></tr>` : ''}`).join('')}</table></div>` : '<div class="empty">Aucune donnée d\'entraîneur. L\'administrateur peut en importer.</div>'}</div>`;
  },
  async admin() {
    if (me?.role !== 'admin') return '<div class="wrap"><div class="err">Accès réservé à l\'administrateur.</div></div>';
    const [u, p, s] = await Promise.all([api('/admin/users'), api('/admin/payments'), api('/admin/settings')]);
    const S = s.settings; const fld = (k, l) => `<label for="s_${k}">${l}</label><input id="s_${k}" data-k="${k}" value="${esc(S[k])}">`;
    return `<div class="wrap"><h2>Administration</h2><div class="grid c3"><div class="card"><strong>${u.items.length}</strong><br>utilisateurs</div><div class="card"><strong>${u.stats.a}</strong><br>analyses</div><div class="card"><strong>${u.stats.e}</strong><br>erreurs journalisées</div></div>
    <h3>Paiements</h3><div class="card scroll">${p.items.length ? `<table><tr><th>Utilisateur</th><th>Moyen</th><th>Réf.</th><th>Montant</th><th>Statut</th><th></th></tr>${p.items.map((i) => `<tr><td>${esc(i.email)}</td><td>${esc(i.method)}</td><td>${esc(i.reference)}</td><td>${esc(i.amount)} ${esc(i.currency)}</td><td>${esc(i.status)}</td><td>${i.status === 'pending' ? `<button class="btn sm" data-pay="${i.id}" data-a="approve">Valider</button> <button class="btn sm bad" data-pay="${i.id}" data-a="reject">Refuser</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune demande.</p>'}</div>
    <h3>Utilisateurs</h3><div class="card scroll"><table><tr><th>Email</th><th>Rôle</th><th>Gratuites</th><th>Premium</th><th></th></tr>${u.items.map((i) => `<tr><td>${esc(i.email)}</td><td>${esc(i.role)}</td><td>${i.free_left}</td><td>${i.premium_until > Date.now() ? 'oui' : 'non'}</td><td><button class="btn sm alt" data-reset="${i.id}">Code de récupération</button></td></tr>`).join('')}</table></div><div id="rc"></div>
    <h3>Configuration</h3><form class="card" id="sf"><div class="grid c2"><div>${fld('free_analyses', 'Analyses gratuites (nouveaux comptes)')}${fld('price_xof', 'Prix FCFA')}${fld('price_usd', 'Prix USD')}${fld('premium_days', 'Durée premium en jours (0 = illimité)')}</div><div>${fld('orange_enabled', 'Orange Money actif (1 ou 0)')}${fld('orange_number', 'Numéro Orange Money')}${fld('crypto_enabled', 'Crypto active (1 ou 0)')}${fld('crypto_address', 'Adresse ou lien de réception')}${fld('crypto_network', 'Réseau')}${fld('crypto_coin', 'Cryptomonnaie')}${fld('crypto_amount', 'Montant crypto')}${fld('crypto_instructions', 'Instructions')}</div></div><div id="se"></div><p></p><button class="btn">Enregistrer</button></form>
    <h3>Importer des données (CSV)</h3><div class="card"><label for="ct">Type de fichier</label><select id="ct"><option value="matches">Matchs : date,competition,home,away,home_goals,away_goals</option><option value="players">Joueurs : name,team,position,season,minutes,starts,sub_apps,goals,assists,shots</option><option value="coaches">Entraîneurs : name,team,start_date,end_date,matches,wins,draws,losses,style_note</option></select><label><input type="checkbox" id="csb" style="width:auto;min-height:0"> Fichier issu de StatsBomb Open Data (attribution affichée)</label><p class="muted small">Dates AAAA-MM-JJ. Dès 20 matchs importés, ils remplacent la démonstration ; joueurs et entraîneurs remplacent leur démo dès le premier import. Les matchs en double sont ignorés.</p><textarea id="csv" placeholder="date,competition,home,away,home_goals,away_goals"></textarea><input type="file" id="csvf" accept=".csv,text/csv"><div id="ce"></div><p></p><button class="btn" id="ci">Importer</button></div></div>`;
  },
};

function note(sel, msg, ok) { const el = $(sel); if (el) el.innerHTML = `<div class="${ok ? 'ok' : 'err'}" role="alert">${esc(msg)}</div>`; }

function renderResult(r, extra = '') {
  const p = r.probabilities, H = r.home, A = r.away, sb = (v) => `style="width:${v}%"`;
  const stat = (l, a, b, max) => `<div class="stat"><span>${a}</span><div class="b"><i ${sb(Math.min(100, a / max * 100))}></i><i ${sb(Math.min(100, b / max * 100))}></i></div><span style="text-align:right">${b}</span><small>${l}</small></div>`;
  const fm = (f) => `<div class="form">${f.seq.map((x) => `<span class="${x}">${x}</span>`).join('') || '—'}</div><p class="small muted">Points/match pondérés : ${f.ppg ?? '—'}</p>`;
  const list = (a) => a.length ? `<ul class="clean">${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">Rien de marquant.</p>';
  const tabs = {
    Résumé: `<p>${esc(r.explanation)}</p><h3>Scores plausibles</h3><div class="scroll"><table>${r.top_scores.map((s) => `<tr><td><strong>${esc(s.score)}</strong></td><td>${s.pct} %</td></tr>`).join('')}</table></div><h3>Carte des scores</h3>${heatSvg(r.heat, H, A)}<h3>Tendances</h3>${list(r.trends)}`,
    Comparaison: `${stat('Buts attendus', r.xg.home, r.xg.away, 4)}${stat('Classement Elo', r.elo.home, r.elo.away, 1800)}${stat('Force offensive (1 = moyenne)', r.team_stats.home.att, r.team_stats.away.att, 2)}${stat('Fragilité défensive (plus bas = mieux)', r.team_stats.home.def, r.team_stats.away.def, 2)}<p class="small muted">${esc(r.xg.note)}</p>`,
    Forme: `<h3>${esc(H)}</h3>${fm(r.form.home)}<h3>${esc(A)}</h3>${fm(r.form.away)}<h3>Confrontations directes</h3>${r.h2h.last.length ? `<table>${r.h2h.last.map((m) => `<tr><td>${esc(m.date)}</td><td>${esc(m.home)} ${esc(m.score)} ${esc(m.away)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune confrontation dans les données.</p>'}`,
    Forces: `<div class="grid c2"><div><h3>${esc(H)}</h3><strong>Points forts</strong>${list(r.strengths.home)}<strong>Points faibles</strong>${list(r.weaknesses.home)}</div><div><h3>${esc(A)}</h3><strong>Points forts</strong>${list(r.strengths.away)}<strong>Points faibles</strong>${list(r.weaknesses.away)}</div></div>`,
    Fiabilité: `<p><span class="tag">Confiance : ${esc(r.confidence.level)}</span></p><p>${esc(r.confidence.note)}</p><h3>Facteurs qui pourraient changer l'analyse</h3>${list(r.factors)}<h3>Limites</h3>${list(r.limits)}<h3>Données</h3><p class="small muted">${r.data.matches_used} matchs · source : ${esc(r.data.source || '—')} · modèle v${esc(r.model_version)} · dernier match de ces équipes il y a ${r.data.last_match_age_days} jours.</p>`,
  };
  const html = `<article class="match">${r.data.fictional ? '<p><span class="tag demo">Données fictives — démonstration</span></p>' : ''}${extra}
  <div class="teams"><div>${crest(H)}<div class="tname">${esc(H)}</div></div><div class="vs">contre</div><div>${crest(A)}<div class="tname">${esc(A)}</div></div></div>
  <div class="probbar" role="img" aria-label="Victoire ${esc(H)} ${p.home}%, nul ${p.draw}%, victoire ${esc(A)} ${p.away}%"><span class="pb-h" ${sb(p.home)}>${p.home}%</span><span class="pb-d" ${sb(p.draw)}>${p.draw}%</span><span class="pb-a" ${sb(p.away)}>${p.away}%</span></div>
  <div class="legend"><span>Victoire domicile</span><span>Nul</span><span>Victoire extérieur</span></div>
  <div class="tabs" role="tablist">${Object.keys(tabs).map((k, i) => `<button role="tab" aria-selected="${i === 0}" data-tab="${k}">${k}</button>`).join('')}</div><div id="tabbody">${tabs.Résumé}</div></article>`;
  return { html, tabs };
}

function wire(page, arg) {
  if (page === 'connexion') {
    $('#fl').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/login', { method: 'POST', body: { email: $('#le').value, password: $('#lp').value } }); await boot(); location.hash = '#/analyse'; } catch (x) { note('#le1', x.message); } });
    $('#fr').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/register', { method: 'POST', body: { name: $('#rn').value, email: $('#re').value, password: $('#rp').value } }); await boot(); location.hash = '#/analyse'; } catch (x) { note('#re1', x.message); } });
  }
  if (page === 'connexion') {
    $('#fx').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/reset', { method: 'POST', body: { email: $('#xe').value, code: $('#xc').value, password: $('#xp').value } }); note('#xe1', 'Mot de passe modifié. Vous pouvez vous connecter.', true); } catch (x) { note('#xe1', x.message); } });
  }
  if (page === 'compte') {
    $('#fpw').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/password', { method: 'POST', body: { old_password: $('#po').value, new_password: $('#pn').value } }); note('#pwe', 'Mot de passe modifié.', true); e.target.reset(); } catch (x) { note('#pwe', x.message); } });
  }
  if (page === 'comparer') {
    $('#cgo').addEventListener('click', async () => {
      $('#ce').innerHTML = ''; $('#cres').innerHTML = '<div class="skel"></div>';
      try {
        const q = `?a=${encodeURIComponent($('#ca').value)}&b=${encodeURIComponent($('#cb').value)}`; const c = await api('/compare' + q); const A = c.a, B = c.b;
        $('#cres').innerHTML = `<article class="match"><div class="teams"><div>${crest(A.team)}<div class="tname">${esc(A.team)}</div></div><div class="vs">contre</div><div>${crest(B.team)}<div class="tname">${esc(B.team)}</div></div></div>
        ${bar('Points par match', A.overall.ppg, B.overall.ppg, 3)}${bar('Buts marqués par match', A.overall.gf_pg, B.overall.gf_pg, 3)}${bar('Buts encaissés par match (moins = mieux)', A.overall.ga_pg, B.overall.ga_pg, 3, true)}
        ${bar('Points par match à domicile', A.home.ppg, B.home.ppg, 3)}${bar('Points par match à l\'extérieur', A.away.ppg, B.away.ppg, 3)}${bar('Classement Elo', A.elo, B.elo, 1800)}
        ${bar('Matchs sans but encaissé (%)', A.tendencies.clean_sheet_pct, B.tendencies.clean_sheet_pct, 100)}${bar('Les deux équipes marquent (%)', A.tendencies.btts_pct, B.tendencies.btts_pct, 100)}${bar('Plus de 2,5 buts (%)', A.tendencies.over25_pct, B.tendencies.over25_pct, 100)}
        <div class="grid c2"><div><h3>Forme : ${esc(A.team)}</h3>${seqHtml(A.form)}</div><div><h3>Forme : ${esc(B.team)}</h3>${seqHtml(B.form)}</div></div>
        <h3>Confrontations directes</h3><p>${esc(A.team)} ${c.h2h.record.a} · nuls ${c.h2h.record.draw} · ${esc(B.team)} ${c.h2h.record.b}</p>${c.h2h.last.length ? `<table>${c.h2h.last.map((m) => `<tr><td>${esc(m.date)}</td><td>${esc(m.home)} ${esc(m.score)} ${esc(m.away)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune confrontation dans les données.</p>'}
        ${dataTag(c)}<p class="small muted">Ce comparateur est gratuit et n'utilise aucune analyse. Pour les probabilités, lancez une analyse de match.</p></article>`;
      } catch (x) { $('#cres').innerHTML = ''; note('#ce', x.message); }
    });
  }
  if (page === 'joueurs') {
    const all = window.__players; const per90 = (v, m) => (m >= 180 ? (v / m * 90).toFixed(2) : '—');
    const draw = () => {
      const tm = $('#pt').value, qq = $('#pq').value.toLowerCase();
      const f = all.filter((p) => (!tm || p.team === tm) && p.name.toLowerCase().includes(qq)).sort((a, b) => b.minutes - a.minutes);
      $('#plist').innerHTML = f.length ? `<table><tr><th>Joueur</th><th>Équipe</th><th>Poste</th><th>Min</th><th>Tit.</th><th>Remp.</th><th>B</th><th>PD</th><th>Tirs</th></tr>${f.slice(0, 150).map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${esc(p.position)}</td><td>${p.minutes}</td><td>${p.starts}</td><td>${p.sub_apps}</td><td>${p.goals}</td><td>${p.assists}</td><td>${p.shots}</td></tr>`).join('')}</table><p class="small muted">Tit. = titularisations, Remp. = entrées en jeu, B = buts, PD = passes décisives.</p>` : '<div class="empty">Aucun joueur ne correspond.</div>';
      const opt = f.map((p) => `<option value="${all.indexOf(p)}">${esc(p.name)} (${esc(p.team)})</option>`).join('');
      const a0 = $('#pa').value, b0 = $('#pb').value; $('#pa').innerHTML = opt; $('#pb').innerHTML = opt; const has = (sel, v) => [...$(sel).options].some((o) => o.value === v); if (a0 && has('#pa', a0)) $('#pa').value = a0; if (b0 && has('#pb', b0)) $('#pb').value = b0; else if (f.length > 1) $('#pb').selectedIndex = 1; cmp();
    };
    const cmp = () => {
      const A = all[$('#pa').value], B = all[$('#pb').value]; if (!A || !B) { $('#pcmp').innerHTML = '<div class="empty">Choisissez deux joueurs.</div>'; return; }
      const row = (l, a, b) => `<tr><td>${a}</td><th style="text-align:center">${l}</th><td style="text-align:right">${b}</td></tr>`;
      const apps = (p) => p.starts + p.sub_apps; const mpa = (p) => (apps(p) ? Math.round(p.minutes / apps(p)) : '—');
      $('#pcmp').innerHTML = `<table>${row('Joueur', esc(A.name), esc(B.name))}${row('Minutes', A.minutes, B.minutes)}${row('Titularisations', A.starts, B.starts)}${row('Entrées en jeu', A.sub_apps, B.sub_apps)}${row('Minutes par apparition', mpa(A), mpa(B))}${row('Buts', A.goals, B.goals)}${row('Passes décisives', A.assists, B.assists)}${row('Buts / 90 min', per90(A.goals, A.minutes), per90(B.goals, B.minutes))}${row('Passes déc. / 90 min', per90(A.assists, A.minutes), per90(B.assists, B.minutes))}${row('Tirs / 90 min', per90(A.shots, A.minutes), per90(B.shots, B.minutes))}</table><p class="small muted">Les valeurs par 90 minutes ne sont calculées qu'à partir de 180 minutes jouées : en dessous, l'échantillon est trop petit.</p>`;
    };
    $('#pt').addEventListener('change', draw); $('#pq').addEventListener('input', draw); $('#pa').addEventListener('change', cmp); $('#pb').addEventListener('change', cmp); draw();
  }
  if (page === 'analyse') {
    const show = (r, extra) => {
      const { html, tabs } = renderResult(r, extra); $('#res').innerHTML = html;
      $('#res').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
        $('#res').querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
        $('#tabbody').innerHTML = tabs[b.dataset.tab];
      }));
    };
    if (arg) { api('/history/' + arg).then((j) => { $('#res').innerHTML = ''; show(j.result, `<p class="small muted">Analyse du ${fmtDate(j.created_at)}</p>`); }).catch((x) => { $('#res').innerHTML = `<div class="err">${esc(x.message)}</div>`; }); }
    $('#ta').selectedIndex = 1;
    $('#go').addEventListener('click', async () => {
      const b = $('#go'); b.disabled = true; $('#ae').innerHTML = ''; $('#res').innerHTML = '<div class="skel"></div>';
      try { const j = await api('/analyze', { method: 'POST', body: { home: $('#th').value, away: $('#ta').value } }); me = j.user; nav(); show(j.result); $('#res').scrollIntoView({ behavior: 'smooth' }); }
      catch (x) { $('#res').innerHTML = ''; if (x.code === 'PAYWALL') $('#ae').innerHTML = `<div class="err">${esc(x.message)} <a href="#/paiement">Voir l'offre</a></div>`; else note('#ae', x.message); }
      b.disabled = false;
    });
  }
  if (page === 'paiement') {
    $('#pm')?.addEventListener('change', (e) => document.querySelectorAll('[data-m]').forEach((c) => { c.hidden = c.dataset.m !== e.target.value; }));
    $('#pf')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/pay/request', { method: 'POST', body: { method: $('#pm').value, reference: $('#pr').value } }); route(); } catch (x) { note('#pe', x.message); } });
  }
  if (page === 'admin') {
    document.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => { try { await api(`/admin/payments/${b.dataset.pay}/${b.dataset.a}`, { method: 'POST', body: {} }); route(); } catch (x) { alert(x.message); } }));
    $('#sf').addEventListener('submit', async (e) => { e.preventDefault(); const settings = {}; document.querySelectorAll('#sf [data-k]').forEach((i) => { settings[i.dataset.k] = i.value; }); try { await api('/admin/settings', { method: 'POST', body: { settings } }); cfg = await api('/config'); note('#se', 'Configuration enregistrée.', true); } catch (x) { note('#se', x.message); } });
    document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => { try { const j = await api(`/admin/users/${b.dataset.reset}/reset`, { method: 'POST', body: {} }); $('#rc').innerHTML = `<div class="ok">Code à transmettre à l'utilisateur (valable ${j.expires_in_minutes} min, usage unique) : <strong>${esc(j.code)}</strong></div>`; } catch (x) { note('#rc', x.message); } }));
    $('#csvf').addEventListener('change', async (e) => { $('#csv').value = await e.target.files[0].text(); });
    $('#ci').addEventListener('click', async () => { try { const j = await api(`/admin/import?type=${$('#ct').value}${$('#csb').checked ? '&source=statsbomb' : ''}`, { method: 'POST', csv: true, body: $('#csv').value }); teamsInfo = await api('/teams'); note('#ce', j.imported + ' matchs importés.', true); } catch (x) { note('#ce', x.message); } });
  }
}

async function route() {
  const h = location.hash || '#/'; const [, seg, arg] = h.split('/'); const page = seg || 'home';
  nav(); $('#nav').classList.remove('open');
  app.innerHTML = '<div class="wrap"><div class="skel"></div></div>';
  try {
    if (!pages[page]) { app.innerHTML = '<div class="wrap"><div class="empty">Page introuvable. <a href="#/">Retour à l\'accueil</a></div></div>'; return; }
    app.innerHTML = await pages[page](); wire(page, arg); app.focus(); window.scrollTo(0, 0);
  } catch (x) { app.innerHTML = `<div class="wrap"><div class="err">${esc(x.message)}</div></div>`; }
}
async function boot() { const [c, m, t] = await Promise.all([api('/config'), api('/me'), api('/teams')]); cfg = c; me = m.user; teamsInfo = t; $('#site').textContent = c.site; document.title = c.site + ' — Analyse statistique du football'; }
window.addEventListener('hashchange', route);
boot().then(route).catch((x) => { app.innerHTML = `<div class="wrap"><div class="err">${esc(x.message)}</div></div>`; });
