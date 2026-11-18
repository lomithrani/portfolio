<!--
@component
Cookies et stockage local (français), traduction fidèle de CookiesEn.svelte : le cookie de
session, le cookie de langue, les cookies de Google Identity Services, chaque clé du stockage local avec sa finalité et
sa durée, pourquoi il n'y a pas de bandeau (directive ePrivacy art. 5(3), loi Informatique et
Libertés art. 82), comment les effacer.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'summary', title: 'En bref' },
		{ id: 'cookies', title: 'Cookies' },
		{ id: 'local-storage', title: 'Stockage local' },
		{ id: 'control', title: 'Comment les supprimer' }
	];
</script>

<script lang="ts">
	import LegalDocLink from '../LegalDocLink.svelte';
	import { SITE_NAME } from '../legalDocuments.ts';
	import { LANGUAGE_COOKIE_DAYS, LINKS, SESSION_DAYS } from './facts.ts';

	const lang = 'fr';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="summary">En bref</h3>
<p>
	{SITE_NAME} dépose <strong>deux cookies qui lui sont propres</strong>, l'un qui vous garde
	connecté, l'autre qui retient la langue que vous avez choisie, et utilise le
	<strong>stockage local</strong>
	de votre navigateur pour votre thème et vos brouillons non enregistrés. Il n'y a ni mesure d'audience,
	ni publicité, ni traceur de réseaux sociaux. La connexion avec Google n'est chargée que lorsque vous
	la demandez (par exemple en cliquant sur « Se connecter ») ; elle dépose alors son propre cookie
	<code>g_state</code> sur le domaine de ce site et ses cookies sur accounts.google.com, selon les règles
	de Google. Tout ce qui est listé ici est strictement nécessaire à un service que vous demandez : c'est
	pourquoi le site ne vous demande pas votre consentement par un bandeau (article 5(3) de la directive
	ePrivacy, article 82 de la loi Informatique et Libertés). Les descriptions d'un portfolio peuvent aussi
	afficher des images hébergées sur d'autres sites, choisies par son propriétaire : votre navigateur les
	charge depuis ces sites, qui reçoivent votre adresse IP et des informations sur votre navigateur et
	appliquent leurs propres règles.
</p>

<h3 id="cookies">Cookies</h3>
<div class="legal-table legal-table-wide">
	<table>
		<thead>
			<tr>
				<th scope="col">Nom</th>
				<th scope="col">Déposé par</th>
				<th scope="col">Finalité</th>
				<th scope="col">Durée</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code>auth</code></td>
				<td>L'API de ce site</td>
				<td>
					Vous garde connecté : un jeton signé contenant l'identifiant de votre compte et sa date
					d'expiration. Il ne peut pas être lu par les scripts de la page (HttpOnly), n'est envoyé
					qu'en HTTPS (Secure) et uniquement avec les requêtes de ce site (SameSite). Strictement
					nécessaire.
				</td>
				<td>{SESSION_DAYS} jours, ou jusqu'à votre déconnexion</td>
			</tr>
			<tr>
				<td><code>lang</code></td>
				<td>Ce site</td>
				<td>
					Retient la langue que vous avez choisie (<code>en</code> ou <code>fr</code>, rien
					d'autre), pour que les pages s'ouvrent dans cette langue. Déposé seulement lorsque vous
					choisissez une langue, avec le sélecteur de langue ou un lien qui en demande une (<code
						>?lang=fr</code
					>) ; jusque-là, les pages suivent la langue de votre navigateur et aucun cookie n'est
					déposé. Un lien venu d'ailleurs ne remplace jamais la langue que vous avez choisie. Il ne
					peut pas être lu par les scripts de la page (HttpOnly). Strictement nécessaire à un
					réglage que vous demandez.
				</td>
				<td>{LANGUAGE_COOKIE_DAYS} jours, renouvelés à chaque choix</td>
			</tr>
			<tr>
				<td><code>g_state</code></td>
				<td>Google Identity Services, sur le domaine de ce site</td>
				<td>
					Mémorise vos choix dans l'invite de connexion de Google, par exemple sa fermeture ou la
					désactivation de la connexion automatique après votre déconnexion. Fait partie de la
					connexion avec Google.
				</td>
				<td>Fixée par Google</td>
			</tr>
			<tr>
				<td>Cookies de Google</td>
				<td>Google, sur ses propres domaines (accounts.google.com)</td>
				<td>
					Votre session Google et la sécurité de Google, lus et déposés à l'intérieur du bouton et
					de la fenêtre de connexion de Google.
				</td>
				<td>
					Voir les <a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer"
						>règles de confidentialité de Google</a
					>
				</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	<strong>Quand Google intervient.</strong> Le script de connexion de Google n'est chargé qu'après une
	demande de votre part qui en a besoin : un clic sur un bouton « Se connecter » ou « Se connecter avec
	Google » (dans l'en-tête des portfolios et de l'espace recruteur, ou dans un parcours de recrutement),
	la case d'âge et de conditions cochée sur la page d'accueil, sur la page de l'espace recruteur ou dans
	un formulaire de création de portfolio, la connexion de Google Agenda, ainsi que la déconnexion ou la
	suppression de votre compte, pour désactiver la connexion automatique de Google sur ce navigateur (sans
	quoi Google vous reconnecterait aussitôt). Son chargement transmet à Google votre adresse IP et des
	informations sur votre navigateur, même si vous ne vous connectez pas. Une fois chargé, il le reste
	jusqu'à ce que vous quittiez ou rechargiez le site, y compris sur les pages que vous ouvrez ensuite,
	comme les pages légales.
</p>

<h3 id="local-storage">Stockage local</h3>
<p>
	Ces données restent dans votre navigateur : elles ne nous sont pas envoyées tant que vous
	n'enregistrez pas. Dans les clés ci-dessous, <code>&lt;compte&gt;</code> est l'identifiant de
	votre compte et <code>&lt;portfolio&gt;</code> l'adresse du portfolio.
</p>
<div class="legal-table legal-table-wide">
	<table>
		<thead>
			<tr>
				<th scope="col">Clé</th>
				<th scope="col">Finalité</th>
				<th scope="col">Durée</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code>authenticationStore</code></td>
				<td>
					Une copie de votre session pour les pages : identifiant du compte, adresse e-mail, espace
					choisi, espace recruteur, adresse du portfolio, version des conditions acceptées et
					expiration de la session
				</td>
				<td>Supprimée à votre déconnexion ou à la fin de la session</td>
			</tr>
			<tr>
				<td><code>portfolio-dark-mode</code></td>
				<td>Votre choix de thème clair ou sombre</td>
				<td>Jusqu'à ce que vous l'effaciez</td>
			</tr>
			<tr>
				<td><code>experienceDraft:&lt;compte&gt;:&lt;portfolio&gt;:…</code></td>
				<td>
					Les modifications non enregistrées de l'éditeur d'expériences, pour qu'un rechargement ne
					les perde pas
				</td>
				<td>Jusqu'à ce que vous les enregistriez ou les abandonniez</td>
			</tr>
			<tr>
				<td><code>resumeImport:&lt;compte&gt;:&lt;portfolio&gt;</code></td>
				<td>
					Les brouillons lus dans votre CV pendant votre relecture, pour qu'un rechargement ne perde
					pas un import
				</td>
				<td>Jusqu'à ce que chaque brouillon soit ajouté ou écarté</td>
			</tr>
			<tr>
				<td><code>jobDraft:&lt;compte&gt;:…</code></td>
				<td>Les offres d'emploi non enregistrées de l'éditeur d'offres</td>
				<td>Jusqu'à ce que vous les enregistriez ou les abandonniez</td>
			</tr>
			<tr>
				<td><code>jobImportDraft:&lt;compte&gt;</code></td>
				<td>Le dernier brouillon lu dans un PDF d'offre d'emploi</td>
				<td>Jusqu'à ce que vous l'utilisiez ou l'abandonniez</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	Les brouillons restent dans le navigateur après votre déconnexion. Sur un ordinateur partagé,
	abandonnez-les ou effacez les données du site. La suppression de votre compte efface les
	brouillons de ce compte du navigateur depuis lequel vous le supprimez.
</p>

<h3 id="control">Comment les supprimer</h3>
<ul>
	<li>La déconnexion supprime le cookie de session et la copie de votre session.</li>
	<li>
		Les réglages de votre navigateur permettent de supprimer les cookies et le stockage de ce site
		(« données de site »), ou de les bloquer. Bloquer le cookie <code>auth</code> empêche de se
		connecter ; la lecture des portfolios fonctionne toujours. Sans le cookie
		<code>lang</code>, les pages suivent la langue de votre navigateur.
	</li>
	<li>
		Les cookies de Google se gèrent dans votre navigateur et votre compte Google, selon les
		<a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer"
			>règles de confidentialité de Google</a
		>.
	</li>
</ul>
<p>
	Pour en savoir plus sur le traitement de vos données :
	<LegalDocLink doc="privacy" {lang}>politique de confidentialité</LegalDocLink>.
</p>
