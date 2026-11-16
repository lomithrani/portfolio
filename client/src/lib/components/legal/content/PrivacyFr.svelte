<!--
@component
Politique de confidentialité (français), traduction fidèle de PrivacyEn.svelte : RGPD art. 13,
CalOPPA (Do Not Track, suivi par des tiers), politique de Google sur les données des API
(déclaration Limited Use, reproduite en anglais comme Google la demande), IA et transferts.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'summary', title: 'En bref' },
		{ id: 'controller', title: 'Qui est responsable de vos données' },
		{ id: 'data', title: 'Ce que nous collectons et pourquoi' },
		{ id: 'legal-bases', title: 'Finalités et bases légales' },
		{ id: 'recipients', title: 'Qui reçoit vos données' },
		{ id: 'transfers', title: "Transferts hors de l'Union européenne" },
		{ id: 'retention', title: 'Durées de conservation' },
		{ id: 'rights', title: 'Vos droits' },
		{ id: 'required', title: 'Ce que vous devez fournir' },
		{ id: 'ai', title: 'IA et décisions automatisées' },
		{ id: 'children', title: 'Mineurs' },
		{ id: 'security', title: 'Sécurité' },
		{ id: 'cookies', title: 'Cookies et stockage local' },
		{ id: 'tracking', title: 'Do Not Track, suivi et vente de données' },
		{ id: 'google', title: 'Données des utilisateurs Google' },
		{ id: 'changes', title: 'Modifications de cette politique' }
	];
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MINIMUM_AGE } from 'portfolio-common';
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import PublisherDetails from '../PublisherDetails.svelte';
	import {
		LOG_RETENTION,
		SITE_NAME,
		legalLastUpdated,
		type LegalPublisher
	} from '../legalDocuments.ts';
	import {
		CNIL,
		GOOGLE_CALENDAR_SCOPE,
		HOST,
		IMPORT_MAX_MB,
		LINKS,
		SESSION_DAYS
	} from './facts.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'fr';
	const logRetention = LOG_RETENTION.fr;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="summary">En bref</h3>
<div class="legal-callout">
	<ul>
		<li>
			Pour vous connecter, nous ne conservons que l'identifiant de votre compte Google et votre
			adresse e-mail. Le nom et la photo de votre compte Google ne sont pas conservés.
		</li>
		<li>
			Ce que vous mettez dans votre portfolio est public : c'est le principe du site. Ne publiez pas
			ce que vous souhaitez garder privé.
		</li>
		<li>
			Si vous importez un CV, le PDF est envoyé à Anthropic (États-Unis) pour rédiger vos
			expériences. Nous ne conservons pas le PDF, et rien n'est publié tant que vous ne l'ajoutez
			pas vous-même.
		</li>
		<li>
			Les avis que vous nous donnez sont publiés sous forme de ticket public sur GitHub, sans votre
			nom. Lorsque ce site l'active, Claude d'Anthropic (États-Unis) les trie d'abord.
		</li>
		<li>
			Pas de publicité, pas de mesure d'audience, pas de vente de données. Nos seuls cookies vous
			gardent connecté et retiennent la langue que vous avez choisie ; la connexion avec Google,
			chargée seulement à votre demande, dépose ses propres cookies.
		</li>
		<li>
			Vous pouvez supprimer votre compte et tout son contenu à tout moment depuis
			<a class="link-text" href={resolve('/(site)/account')}>la page de votre compte</a>.
		</li>
	</ul>
</div>

<h3 id="controller">Qui est responsable de vos données</h3>
<p>Le responsable du traitement est l'éditeur de {SITE_NAME} :</p>
<PublisherDetails {publisher} {lang} variant="controller" />
<p>
	Pour toute question sur vos données ou pour exercer vos droits, écrivez à
	<ContactEmail {publisher} {lang} />. Aucun délégué à la protection des données n'a été désigné :
	les traitements décrits ici n'en exigent pas.
</p>

<h3 id="data">Ce que nous collectons et pourquoi</h3>

<h4 id="data-account">Votre compte et la connexion avec Google</h4>
<p>
	Vous vous connectez avec votre compte Google. Google nous transmet un jeton signé ; nous le
	vérifions et ne conservons que l'<strong>identifiant de votre compte Google</strong> et votre
	<strong>adresse e-mail</strong>. Le nom et la photo de votre compte Google ne sont pas conservés.
	Nous enregistrons aussi l'espace que vous utilisez (candidat ou recruteur), les réglages de votre
	espace recruteur si vous en ouvrez un (son offre et le nombre d'imports d'offres d'emploi
	utilisés), et une trace de chaque acceptation des conditions d'utilisation : la version, la date,
	la clé de la confirmation d'âge cochée et l'endroit où vous l'avez cochée. Nous ne demandons ni ne
	conservons votre date de naissance.
</p>

<h4 id="data-portfolio">Votre portfolio (public)</h4>
<p>
	Lorsque vous créez un portfolio, son adresse (par exemple <code>{page.url.host}/jane.doe</code>)
	et tout ce que vous y ajoutez sont <strong>publics</strong> : tout le monde peut les lire et les moteurs
	de recherche peuvent les indexer. Cela comprend le titre et le sous-titre de l'en-tête (généralement
	votre nom), le thème, vos expériences avec leurs entreprises, lieux, dates et descriptions, vos projets
	et compétences, votre parcours de recrutement et ses notes, et la partie publique de vos agendas de
	rendez-vous (titre, description, fuseau horaire, lieu du rendez-vous et créneaux disponibles). Les données
	publiques d'un portfolio contiennent aussi un identifiant interne aléatoire du compte de son propriétaire,
	jamais son adresse e-mail.
</p>
<p>
	Les descriptions des expériences et des projets peuvent afficher des images hébergées sur d'autres
	sites, choisies par le propriétaire du portfolio. Le navigateur des visiteurs les charge depuis
	ces sites, qui reçoivent alors l'adresse IP du visiteur et des informations sur son navigateur,
	selon leurs propres règles. Nous ne choisissons ni ne contrôlons ces images.
</p>

<h4 id="data-resume">Import de CV (facultatif)</h4>
<p>
	Si vous choisissez d'importer un CV, votre PDF (jusqu'à {IMPORT_MAX_MB} Mo) et son nom de fichier sont
	envoyés au modèle Claude d'Anthropic, qui le lit et propose des brouillons de vos expériences. Les brouillons
	reviennent dans votre navigateur, où vous les relisez, les modifiez ou les écartez ; rien n'est ajouté
	à votre portfolio tant que vous ne l'ajoutez pas. Nous ne conservons ni le PDF ni les brouillons sur
	nos serveurs. Pendant votre relecture, les brouillons sont gardés dans votre navigateur (voir <LegalDocLink
		doc="cookies"
		{lang}>cookies et stockage local</LegalDocLink
	>). Pour appliquer les limites d'import, nous comptons les imports avec des compteurs identifiés
	par une empreinte de l'identifiant de votre compte (voir
	<a class="link-text" href="#retention">combien de temps nous les conservons</a> pour ce qu'ils deviennent
	quand vous supprimez votre compte). Évitez d'envoyer un CV contenant des informations que vous ne voulez
	pas voir traitées, comme un numéro d'identité ou des données de santé.
</p>

<h4 id="data-recruiter">Espace recruteur et offres d'emploi</h4>
<p>
	Les recruteurs rédigent des offres d'emploi : intitulé, entreprise, lieu, mode de travail,
	contrat, temps de travail, rémunération, prérequis, avantages et description. Une fois publiée,
	une offre est publique, mais elle ne nomme jamais le compte du recruteur. Une offre peut aussi
	être importée depuis un PDF : il est envoyé à Anthropic comme un CV, et nous ne le conservons pas.
	Lorsque ce site calcule des temps de trajet (voir <a class="link-text" href="#data-perfect-job"
		>poste idéal</a
	>), l'adresse du lieu de travail d'une offre (rue, code postal et ville) est transmise à la
	Géoplateforme de l'IGN, le service cartographique qui la localise : pendant sa saisie dans
	l'éditeur d'offre, lorsque ses champs sont quittés, et lorsque l'offre est notée dans un parcours
	de recrutement comportant un critère de trajet, même pour un brouillon jamais publié.
</p>

<h4 id="data-applications">Candidatures</h4>
<p>
	Lorsque vous postulez à une offre avec votre portfolio, le recruteur qui l'a publiée voit votre
	candidature avec l'adresse et le titre de l'en-tête de votre portfolio. Un recruteur peut aussi
	ajouter un portfolio public à la liste des candidats de l'une de ses offres ; le propriétaire de
	ce portfolio peut alors figurer dans la liste du recruteur. Vous pouvez retirer une candidature,
	et le recruteur peut la retirer de sa liste ; elle est supprimée avec l'offre.
</p>

<h4 id="data-journey">Parcours de recrutement et rendez-vous</h4>
<p>
	Le propriétaire d'un portfolio peut demander aux visiteurs de suivre des étapes avant de réserver
	un rendez-vous (lire une note, choisir l'une de leurs offres d'emploi, puis réserver). Pour un
	visiteur connecté, nous enregistrons sa progression dans chaque parcours : les étapes terminées et
	leur date, l'offre choisie, et la date de réservation d'un rendez-vous.
</p>
<p>
	Pour réserver un rendez-vous, vous indiquez votre <strong>nom</strong>, votre
	<strong>adresse e-mail</strong> et, si vous le souhaitez, une note. Ils ne sont pas enregistrés dans
	notre base de données : ils sont envoyés à l'agenda Google du propriétaire du portfolio, qui crée l'événement
	avec vous comme invité et vous envoie l'invitation par e-mail. L'invitation contient aussi les éléments
	des étapes précédentes (par exemple l'intitulé, l'entreprise et le lien de l'offre choisie). Nous ne
	gardons qu'une réservation du créneau (l'horaire, l'agenda, l'identifiant de l'événement et une empreinte
	de votre adresse e-mail calculée avec une clé secrète), supprimée automatiquement à la fin du créneau
	ou à l'annulation du rendez-vous.
</p>

<h4 id="data-perfect-job">Votre poste idéal (privé)</h4>
<p>
	Le propriétaire d'un portfolio peut décrire le poste qu'il recherche : des critères comme la
	rémunération demandée, les contrats et les modes de travail acceptés, ses compétences, et
	l'importance de chacun. Cette description est <strong>privée</strong> : seul son propriétaire peut la
	lire. S'il ajoute l'étape correspondante à son parcours de recrutement, l'offre choisie par un recruteur
	est notée sur 100 au regard de ces critères, selon des règles fixes. Le recruteur voit la note et le
	minimum fixé par le propriétaire et, si celui-ci le décide, le nom de chaque critère et si son offre
	y correspond ; jamais ce que le propriétaire a demandé. Un recruteur qui essaie plusieurs offres peut
	néanmoins en déduire une partie à partir des notes.
</p>
<p>
	Le critère de trajet est facultatif, et proposé uniquement lorsque ce site calcule des temps de
	trajet. Il conserve l'adresse d'où vous partez (un lieu proche convient aussi bien que votre
	domicile) et sa position sur une carte. Pour la trouver, pendant sa saisie et à son
	enregistrement, et calculer les temps de trajet jusqu'à un poste, cette adresse est transmise à la
	Géoplateforme de l'IGN, le service cartographique de l'État, et, lorsque les transports en commun
	sont proposés, sa position au calculateur d'itinéraires que ce site utilise : HERE, ou Transitous,
	un calculateur d'itinéraires animé par des bénévoles. Aucun d'eux ne reçoit votre nom, votre
	compte ni votre adresse IP. Les recruteurs ne voient jamais votre adresse ; le fait que le trajet
	vers leur poste corresponde ou non renseigne toutefois sur l'endroit où vous vous trouvez.
	L'adresse du bureau d'une offre, saisie par son recruteur, est recherchée de la même façon.
</p>

<h4 id="data-calendar">Google Agenda (propriétaires de portfolio)</h4>
<p>
	Le propriétaire d'un portfolio qui propose des rendez-vous connecte son agenda Google. Nous
	conservons alors les jetons d'accès fournis par Google, qui permettent au site de savoir quand il
	est occupé et de créer les événements réservés par les visiteurs. Les détails figurent dans
	<a class="link-text" href="#google">Données des utilisateurs Google</a>.
</p>

<h4 id="data-suggestions">Suggestions d'étapes</h4>
<p>
	Les propriétaires de portfolio peuvent suggérer un nouveau type d'étape de parcours. Le texte de
	la suggestion (un nom, ce qu'un recruteur ferait, en quoi cela aiderait) est publié sous forme de
	<strong>ticket public sur GitHub</strong>, sans votre nom ni aucun identifiant. L'identifiant de
	votre compte n'est écrit que dans le journal de notre serveur.
</p>

<h4 id="data-feedback">Vos avis</h4>
<p>
	Une fois connecté, chacun peut nous donner son avis (un problème, une idée) avec « Donner votre
	avis », dans le menu du compte ou en bas de chaque page. Il est publié sous forme de
	<strong>ticket public sur GitHub</strong>, dans le dépôt du projet, sans votre nom ni aucun
	identifiant : n'y écrivez rien que vous ne voudriez pas rendre public, ni les données personnelles
	de quelqu'un d'autre. Avec votre texte, le ticket indique le type de page où vous étiez (sa route
	dans le site, comme <code>/[domain]/experiences</code>, jamais l'adresse d'un portfolio), le nom
	et la version majeure de votre navigateur et votre système d'exploitation (déduits de ce qu'envoie
	votre navigateur, jamais déposés tels quels), la taille de la fenêtre de votre navigateur, le
	thème clair ou sombre et la langue du site.
</p>
<p>
	Lorsque ce site l'active, votre texte est d'abord envoyé au modèle Claude d'Anthropic
	(États-Unis), qui le classe comme bug, demande de fonctionnalité ou tâche et rédige un titre et un
	court résumé en anglais, publiés eux aussi dans le ticket. Sinon, ou si Claude échoue, il est
	déposé comme tâche. Nous ne conservons pas vos avis dans notre base de données : l'identifiant de
	votre compte, le numéro du ticket et son type ne sont écrits que dans le journal de notre serveur
	({logRetention}). Pour limiter le nombre d'avis envoyés par chaque compte et par jour, nous les
	comptons avec des compteurs identifiés par une empreinte de l'identifiant de votre compte. La
	suppression de votre compte ne retire pas un ticket déjà publié : pour le faire retirer, écrivez à <ContactEmail
		{publisher}
		{lang}
	/>.
</p>

<h4 id="data-technical">Données techniques</h4>
<p>
	Pour protéger le site contre les abus, nous comptons certaines requêtes (réservations de
	rendez-vous, consultations des disponibilités, vérifications d'adresse de portfolio) par adresse
	IP et par adresse e-mail. Les compteurs ne stockent qu'une empreinte de l'adresse calculée avec
	une clé secrète, jamais l'adresse elle-même, et sont supprimés automatiquement à la fin de leur
	période (d'une heure à 30 jours).
</p>
<p>
	Nos serveurs tiennent un journal des requêtes qu'ils traitent (méthode, route, statut et erreurs),
	sans adresse IP, e-mail ni nom. Notre hébergeur tient ses propres journaux des requêtes entrantes
	et, lorsque la supervision est activée, notre prestataire de supervision reçoit des traces des
	requêtes, qui comprennent l'adresse IP, l'agent utilisateur du navigateur, l'adresse de la page
	sans ses paramètres et les en-têtes de la requête (les cookies, les en-têtes d'autorisation, les
	paramètres d'adresse et le corps des requêtes sont retirés avant l'envoi).
</p>

<h4 id="data-device">Sur votre appareil</h4>
<p>
	Le site dépose deux cookies qui lui sont propres, l'un pour vous garder connecté, l'autre pour
	retenir la langue que vous avez choisie, et enregistre certaines données dans votre navigateur
	(thème, brouillons non enregistrés). La connexion avec Google, quand vous la demandez, dépose ses
	propres cookies. Voir
	<LegalDocLink doc="cookies" {lang}>cookies et stockage local</LegalDocLink>.
</p>

<h3 id="legal-bases">Finalités et bases légales</h3>
<div class="legal-table">
	<table>
		<thead>
			<tr>
				<th scope="col">Finalité</th>
				<th scope="col">Base légale (RGPD art. 6)</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>Créer votre compte, vous connecter et vous garder connecté</td>
				<td>Exécution du contrat (les conditions d'utilisation), art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Publier votre portfolio, votre parcours de recrutement et vos agendas de rendez-vous</td
				>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>
					Noter les offres choisies dans votre parcours de recrutement au regard de votre poste
					idéal, et calculer les temps de trajet qu'il demande
				</td>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Importer un CV ou une offre d'emploi en PDF à votre demande</td>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Espace recruteur, pages publiques des offres et candidatures</td>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>
					Progression dans les parcours et réservation de rendez-vous, y compris l'envoi de vos
					coordonnées à l'agenda du propriétaire du portfolio
				</td>
				<td>Contrat, ou mesures précontractuelles prises à votre demande, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Connecter l'agenda Google d'un propriétaire de portfolio</td>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Déposer vos suggestions d'étapes sur GitHub</td>
				<td>Contrat, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>
					Déposer vos avis sur GitHub et, lorsque ce site l'active, les faire trier par un modèle
					d'IA
				</td>
				<td>
					Contrat, art. 6(1)(b), pour leur dépôt à votre demande ; intérêt légitime, art. 6(1)(f),
					pour leur tri : traiter rapidement les avis
				</td>
			</tr>
			<tr>
				<td
					>Conserver une trace de votre acceptation des conditions et de votre confirmation d'âge</td
				>
				<td>
					Intérêt légitime, art. 6(1)(f) : pouvoir démontrer quelles conditions vous avez acceptées
					et que vous avez déclaré l'âge requis
				</td>
			</tr>
			<tr>
				<td>
					Sécurité, limitation du nombre de requêtes, quotas d'import, prévention des abus, journaux
					et supervision
				</td>
				<td>
					Intérêt légitime, art. 6(1)(f) : garder le site sûr et disponible, empêcher les
					réservations abusives et l'abus des imports par IA, qui sont payants. Les données sont
					minimales, remplacées par une empreinte lorsque c'est possible et conservées peu de temps
					; vous pouvez vous y opposer (voir <a class="link-text" href="#rights">vos droits</a>)
				</td>
			</tr>
			<tr>
				<td>
					Répondre à vos demandes et signalements, et respecter la loi (protection des données,
					règlement sur les services numériques, demandes des autorités)
				</td>
				<td>Obligation légale, art. 6(1)(c)</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	Nous n'utilisons pas vos données à des fins publicitaires ni de profilage, et nous ne les vendons
	jamais.
</p>

<h3 id="recipients">Qui reçoit vos données</h3>
<ul>
	<li>
		<strong>Le public</strong> : le contenu des portfolios, les offres d'emploi publiées (sans l'identité
		du recruteur), les notes des parcours et la partie publique des agendas de rendez-vous ; sur GitHub,
		les suggestions d'étapes et les avis que vous envoyez (sans votre nom).
	</li>
	<li>
		<strong>Les recruteurs</strong> : l'adresse et le titre de l'en-tête des portfolios figurant dans
		la liste des candidats de leurs offres.
	</li>
	<li>
		<strong>Les propriétaires de portfolio</strong> : le nom, l'adresse e-mail et la note d'un visiteur
		qui réserve un rendez-vous, avec les éléments des étapes précédentes du parcours, dans l'invitation
		de leur agenda Google.
	</li>
	<li>
		<strong>Nos sous-traitants</strong>, qui agissent sur nos instructions :
		<ul>
			<li>
				{HOST.name} (États-Unis) : hébergement de l'application web, de l'API, de la base de données et
				de leurs journaux, dans sa région US West (<a
					class="link-text"
					href={LINKS.railwayPrivacy}
					rel="noopener noreferrer">politique de confidentialité</a
				>) ;
			</li>
			<li>
				Anthropic PBC (États-Unis) : lecture des PDF de CV et d'offres d'emploi que vous importez,
				et tri des avis que vous envoyez, lorsque ce site l'active. Selon les <a
					class="link-text"
					href={LINKS.anthropicCommercialTerms}
					rel="noopener noreferrer">conditions commerciales</a
				> d'Anthropic, Anthropic n'entraîne pas ses modèles sur les contenus envoyés par son API ;
			</li>
			<li>
				notre prestataire de supervision : traces des requêtes et journaux du serveur, lorsque la
				supervision est activée.
			</li>
		</ul>
	</li>
	<li>
		<strong>Des responsables de traitement indépendants</strong>, selon leurs propres politiques :
		<ul>
			<li>
				Google LLC (États-Unis) : la connexion avec Google, et l'agenda Google des propriétaires de
				portfolio qui le connectent, qui envoie aussi les invitations par e-mail (<a
					class="link-text"
					href={LINKS.googlePrivacy}
					rel="noopener noreferrer">règles de confidentialité de Google</a
				>) ;
			</li>
			<li>
				GitHub, Inc. (États-Unis) : les suggestions d'étapes et les avis, publiés sous forme de
				tickets publics (<a class="link-text" href={LINKS.githubPrivacy} rel="noopener noreferrer"
					>déclaration de confidentialité de GitHub</a
				>) ;
			</li>
			<li>
				l'IGN, Institut national de l'information géographique et forestière (France) : les adresses
				à localiser et les points entre lesquels calculer un temps de trajet, pour le critère de
				trajet (<a class="link-text" href={LINKS.geoplateforme} rel="noopener noreferrer"
					>Géoplateforme</a
				>) ;
			</li>
			<li>
				HERE (HERE Technologies, Pays-Bas), ou Transitous, un calculateur d'itinéraires animé par
				des bénévoles, selon celui que ce site utilise : les points entre lesquels calculer un temps
				de trajet en transports en commun, lorsque ce site le propose (<a
					class="link-text"
					href={LINKS.herePrivacy}
					rel="noopener noreferrer">politique de confidentialité de HERE</a
				>,
				<a class="link-text" href={LINKS.transitous} rel="noopener noreferrer">transitous.org</a>).
			</li>
		</ul>
	</li>
	<li>
		<strong>Les autorités</strong>, uniquement lorsque la loi l'exige.
	</li>
</ul>

<h3 id="transfers">Transferts hors de l'Union européenne</h3>
<p>
	Notre hébergeur, Anthropic, Google, GitHub et notre prestataire de supervision peuvent traiter des
	données aux <strong>États-Unis</strong> ; la base de données y est hébergée. Ces transferts
	reposent sur le
	<a class="link-text" href={LINKS.dpf} rel="noopener noreferrer"
		>cadre de protection des données UE-États-Unis</a
	>
	(décision d'adéquation de la Commission européenne du 10 juillet 2023) pour les destinataires certifiés,
	et à défaut sur les
	<a class="link-text" href={LINKS.scc} rel="noopener noreferrer">clauses contractuelles types</a> de
	la Commission européenne (décision (UE) 2021/914) prévues par leurs conditions de traitement des données.
	Vous pouvez nous demander une copie de ces garanties.
</p>

<h3 id="retention">Durées de conservation</h3>
<div class="legal-table">
	<table>
		<thead>
			<tr>
				<th scope="col">Données</th>
				<th scope="col">Durée</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>Compte (identifiant Google, e-mail, espaces, acceptations des conditions)</td>
				<td>Jusqu'à la suppression de votre compte</td>
			</tr>
			<tr>
				<td>
					Portfolio, expériences, parcours de recrutement, poste idéal (y compris l'adresse d'où
					vous partez), agendas de rendez-vous, offres d'emploi, candidatures
				</td>
				<td>Jusqu'à ce que vous les supprimiez, ou votre compte</td>
			</tr>
			<tr>
				<td>Temps de trajet, et position des adresses des offres d'emploi</td>
				<td>
					30 jours pour un temps de trajet, 90 pour la position de l'adresse d'un poste, sous une
					empreinte calculée avec une clé secrète qui ne montre pas les adresses ; ils ne sont
					rattachés à aucun compte
				</td>
			</tr>
			<tr>
				<td>Votre progression dans les parcours d'autres portfolios</td>
				<td>
					Jusqu'à la suppression de votre compte, ou jusqu'à ce que le propriétaire retire l'étape
					ou supprime son compte
				</td>
			</tr>
			<tr>
				<td>PDF de CV et d'offres d'emploi</td>
				<td>
					Non conservés par nous. Anthropic ne garde les données de son API que pendant une durée
					limitée, selon ses conditions commerciales
				</td>
			</tr>
			<tr>
				<td>Suggestions d'étapes et avis</td>
				<td>
					Non conservés dans notre base de données. Publiés sur GitHub jusqu'à la suppression du
					ticket : écrivez-nous pour en faire retirer un. Le texte d'un avis trié par Claude n'est
					gardé par Anthropic que pendant une durée limitée, selon ses conditions commerciales
				</td>
			</tr>
			<tr>
				<td>Réservations de créneaux</td>
				<td>
					Supprimées automatiquement à la fin du créneau ou à l'annulation du rendez-vous
					(l'invitation reste dans les agendas du propriétaire et de l'invité, selon les conditions
					de Google)
				</td>
			</tr>
			<tr>
				<td>Jetons Google Agenda</td>
				<td>
					Jusqu'à ce que le propriétaire déconnecte Google Agenda ou supprime son compte ; ils sont
					alors supprimés, et nous demandons à Google de révoquer l'accès
				</td>
			</tr>
			<tr>
				<td>Compteurs de limitation et de quotas (empreintes)</td>
				<td>
					Supprimés automatiquement à la fin de leur période : d'une heure à 30 jours. Quand vous
					supprimez votre compte, les quotas que vous avez utilisés (imports de CV et d'offres,
					suggestions d'étapes, avis, et imports d'offres de votre offre recruteur) sont reportés
					sur des compteurs identifiés par une empreinte de l'identifiant de votre compte Google,
					conservés jusqu'à la fin de leur période (30 jours au plus), pour que supprimer puis
					recréer un compte ne les remette pas à zéro
				</td>
			</tr>
			<tr>
				<td>Journaux du serveur, journaux de l'hébergeur et traces</td>
				<td>{logRetention}</td>
			</tr>
			<tr>
				<td>Messages que vous nous envoyez (demandes, signalements)</td>
				<td>
					Le temps nécessaire pour les traiter et garder une trace de la façon dont ils ont été
					traités
				</td>
			</tr>
			<tr>
				<td>Cookie de session</td>
				<td>{SESSION_DAYS} jours, ou jusqu'à votre déconnexion</td>
			</tr>
			<tr>
				<td>Données enregistrées dans votre navigateur</td>
				<td>
					Jusqu'à ce que vous les effaciez, ou comme indiqué sur la page
					<LegalDocLink doc="cookies" {lang}>cookies et stockage local</LegalDocLink>
				</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	La suppression de votre compte depuis <a class="link-text" href={resolve('/(site)/account')}
		>la page de votre compte</a
	>
	est immédiate : votre compte, votre portfolio et ses expériences, votre parcours de recrutement et la
	progression de ses visiteurs, votre progression dans d'autres parcours, vos agendas et réservations
	de rendez-vous, vos offres d'emploi et leurs candidatures, ainsi que vos candidatures sont aussitôt
	retirés de notre base de données, les jetons Google Agenda sont supprimés et nous demandons à Google
	de révoquer l'accès (vous pouvez le vérifier dans les
	<a class="link-text" href={LINKS.googlePermissions} rel="noopener noreferrer"
		>autorisations de votre compte Google</a
	>), et l'adresse de votre portfolio redevient disponible. Ce qui reste : les noms de compétences
	du catalogue partagé (ils ne sont liés à personne), les suggestions d'étapes et les avis déjà
	publiés sur GitHub (écrivez-nous pour en faire retirer un), les créneaux que vous avez réservés
	comme invité d'autres portfolios (jusqu'à la fin du créneau), les compteurs contre les abus et de
	quotas (empreintes, supprimées à la fin de leur période, 30 jours au plus ; les quotas utilisés
	sont reportés sur une empreinte de l'identifiant de votre compte Google, comme indiqué ci-dessus),
	et les journaux jusqu'à leur expiration.
</p>

<h3 id="rights">Vos droits</h3>
<p>Où que vous résidiez, vous pouvez :</p>
<ul>
	<li><strong>accéder</strong> à vos données et en obtenir une copie ;</li>
	<li>
		les <strong>rectifier</strong> : vous modifiez vous-même votre portfolio et vos offres ; votre adresse
		e-mail est celle de votre compte Google ;
	</li>
	<li>
		les <strong>effacer</strong> : supprimez vous-même votre compte depuis
		<a class="link-text" href={resolve('/(site)/account')}>la page de votre compte</a>, ou
		demandez-le-nous ; les suggestions d'étapes et les avis publiés sur GitHub ne sont pas retirés
		avec votre compte : demandez-le-nous pour ceux-là ;
	</li>
	<li>en <strong>limiter</strong> le traitement ;</li>
	<li>
		vous <strong>opposer</strong> aux traitements fondés sur notre intérêt légitime, pour des raisons
		tenant à votre situation ;
	</li>
	<li>
		<strong>recevoir</strong> les données que vous nous avez fournies dans un format structuré et lisible
		par machine (portabilité) : nous les envoyons en JSON sur demande.
	</li>
</ul>
<p>
	Écrivez à <ContactEmail {publisher} {lang} />, si possible depuis l'adresse e-mail de votre
	compte, afin que nous puissions vérifier que la demande vient de vous. Nous répondons dans un
	délai d'un mois ; lorsqu'une demande est complexe, ce délai peut être prolongé de deux mois et
	nous vous en indiquons la raison.
</p>
<p>
	Vous pouvez aussi introduire une réclamation auprès d'une autorité de protection des données,
	notamment celle du lieu où vous résidez ou travaillez. En France : {CNIL.name}, {CNIL.address},
	<a class="link-text" href={CNIL.website} rel="noopener noreferrer">www.cnil.fr</a>
	(<a class="link-text" href={CNIL.complaint} rel="noopener noreferrer">adresser une plainte</a>).
</p>

<h3 id="required">Ce que vous devez fournir</h3>
<p>
	Un compte Google est nécessaire pour vous connecter : sans lui, vous pouvez lire les portfolios et
	les offres d'emploi, mais pas créer de portfolio, postuler ni publier. La réservation d'un
	rendez-vous nécessite votre nom et votre adresse e-mail, dont le propriétaire du portfolio a
	besoin pour vous rencontrer. Tout le reste, y compris l'import de CV, est facultatif.
</p>

<h3 id="ai">IA et décisions automatisées</h3>
<p>
	Les imports de CV et d'offres d'emploi utilisent Claude, un modèle d'IA conçu par Anthropic. Ses
	brouillons peuvent être incomplets ou erronés : vous les relisez et les modifiez, et rien n'est
	publié tant que vous ne l'ajoutez pas. Aucune décision produisant des effets juridiques ou vous
	affectant de manière significative n'est prise par des moyens automatisés : le site ne note, ne
	classe ni ne filtre les candidats, et les recruteurs voient les candidatures telles qu'elles sont.
</p>
<p>
	Lorsque ce site l'active, Claude trie aussi les avis que vous envoyez (bug, demande de
	fonctionnalité ou tâche) et rédige leur titre et leur résumé. Ils sont publiés dans le ticket avec
	votre texte, où vous pouvez les voir, et ne décident que de la façon dont les mainteneurs le
	classent : rien qui vous concerne.
</p>
<p>
	Un parcours de recrutement peut noter l'offre choisie par un recruteur au regard du poste idéal du
	propriétaire, et n'ouvrir ses étapes suivantes qu'à partir d'un minimum fixé par celui-ci. La note
	est calculée selon des règles fixes, et non par un modèle d'IA, et elle porte sur l'offre, non sur
	une personne : le recruteur peut la compléter, en choisir une autre, ou joindre le propriétaire
	autrement.
</p>

<h3 id="children">Mineurs</h3>
<p>
	Le site ne s'adresse pas aux personnes de moins de {MINIMUM_AGE} ans ou n'ayant pas atteint l'âge légal
	minimum pour travailler dans leur pays. Le confirmer est exigé lors de l'inscription depuis la page
	d'accueil ou de la création d'un portfolio, et utiliser un compte signifie que vous remplissez ces conditions.
	Si nous apprenons qu'un compte appartient à une personne plus jeune, nous le supprimons. Les parents
	et tuteurs peuvent nous écrire à <ContactEmail {publisher} {lang} /> pour en demander la suppression.
</p>

<h3 id="security">Sécurité</h3>
<p>
	Les connexions passent par HTTPS. Le cookie de session ne peut pas être lu par les scripts de la
	page. Les jetons Google Agenda ne sont jamais renvoyés par l'API ni écrits dans les journaux. Les
	adresses IP et e-mail utilisées contre les abus sont remplacées par une empreinte calculée avec
	une clé secrète. Les cookies, les en-têtes d'autorisation, les paramètres d'adresse et le corps
	des requêtes sont retirés des traces. Si une violation de données personnelles est susceptible de
	vous exposer à un risque, nous la notifions à la CNIL dans les 72 heures et vous en informons sans
	tarder lorsque le risque est élevé.
</p>

<h3 id="cookies">Cookies et stockage local</h3>
<p>
	Le site dépose deux cookies qui lui sont propres, l'un qui vous garde connecté, l'autre qui
	retient la langue que vous avez choisie, et utilise le stockage de votre navigateur pour vos
	préférences et vos brouillons non enregistrés. La connexion avec Google n'est chargée que lorsque
	vous la demandez ; elle dépose alors son cookie <code>g_state</code> sur le domaine de ce site et
	ses propres cookies sur accounts.google.com. Il n'y a aucun cookie de mesure d'audience ni de
	publicité : aucun bandeau de consentement n'est donc nécessaire. La liste complète figure sur la
	page
	<LegalDocLink doc="cookies" {lang}>cookies et stockage local</LegalDocLink>.
</p>

<h3 id="tracking">Do Not Track, suivi et vente de données</h3>
<p>
	Le site ne vous suit pas sur d'autres sites et n'utilise ni mesure d'audience ni publicité. Il
	traite donc tous les visiteurs de la même manière, que leur navigateur envoie ou non un signal Do
	Not Track ou Global Privacy Control.
</p>
<p>
	Aucun tiers ne collecte pour notre compte d'informations sur votre activité sur ce site au fil du
	temps et sur d'autres sites. Deux sortes de tiers peuvent toutefois recevoir des informations
	quand vous le parcourez. Google, dont le script de connexion est chargé quand vous le demandez
	(clic sur un bouton de connexion, case d'âge et de conditions cochée, connexion de Google Agenda,
	déconnexion ou suppression de votre compte) : Google reçoit alors votre adresse IP et des
	informations sur votre navigateur, et peut lire ou déposer ses cookies, selon les
	<a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer"
		>règles de confidentialité de Google</a
	>. Et les sites qui hébergent les images que le propriétaire d'un portfolio affiche dans ses
	descriptions : votre navigateur les charge depuis ces sites, qui reçoivent votre adresse IP et des
	informations sur votre navigateur.
</p>
<p>
	Nous ne vendons ni ne partageons de données personnelles, et ne les utilisons pas pour de la
	publicité ciblée. Nous ne collectons pas sciemment de données sensibles : merci de ne pas publier
	de données de santé, de numéros d'identité ou d'informations similaires dans votre portfolio.
</p>

<h3 id="google">Données des utilisateurs Google</h3>
<p>
	Google demande que l'engagement suivant soit publié ; il signifie que l'utilisation et le
	transfert vers toute autre application des informations reçues des API Google respectent la
	politique de Google relative aux données des utilisateurs des services d'API, y compris ses
	exigences d'utilisation limitée :
</p>
<p class="legal-callout" lang="en">
	{SITE_NAME}'s use and transfer to any other app of information received from Google APIs will
	adhere to the
	<a class="link-text" href={LINKS.googleApiPolicy} rel="noopener noreferrer" hreflang="en"
		>Google API Services User Data Policy</a
	>, including the Limited Use requirements.
</p>
<ul>
	<li>
		<strong>Connexion avec Google</strong> : nous recevons l'identifiant de votre compte Google, votre
		adresse e-mail, votre nom et votre photo dans un jeton signé, et ne conservons que l'identifiant et
		l'adresse e-mail, pour créer votre compte et vous connecter.
	</li>
	<li>
		<strong>Google Agenda</strong>, uniquement pour les propriétaires de portfolio qui le connectent
		: le site demande le périmètre <code>{GOOGLE_CALENDAR_SCOPE}</code> et ne l'utilise que pour lister
		vos agendas afin que vous choisissiez celui des rendez-vous, lire les plages occupées de cet agenda
		(pas le contenu de vos événements) pour afficher les créneaux libres, créer l'événement de chaque
		réservation (avec un lien Google Meet si vous l'avez choisi) et envoyer son invitation, et lister
		et annuler les événements réservés par ce site.
	</li>
	<li>
		Les données reçues de Google ne sont pas utilisées à des fins publicitaires, ne sont pas
		vendues, ne sont pas transférées à des courtiers en données, ne sont pas envoyées à Anthropic ni
		à aucun autre modèle d'IA et ne servent pas à entraîner de modèles d'IA. Personne ne les lit,
		sauf avec votre accord, pour des raisons de sécurité ou pour respecter la loi.
	</li>
	<li>
		Les jetons Google Agenda sont conservés dans notre base de données pour qu'une réservation
		fonctionne en votre absence ; ils ne sont jamais renvoyés par l'API ni journalisés. Déconnecter
		Google Agenda (Admin, Appointments, Disconnect) ou supprimer votre compte les supprime, et nous
		demandons à Google de révoquer l'accès ; si Google ne répond pas à ce moment-là, l'accès peut
		rester listé dans votre compte Google jusqu'à ce que vous l'y retiriez. Vous pouvez le vérifier
		ou le révoquer à tout moment depuis les
		<a class="link-text" href={LINKS.googlePermissions} rel="noopener noreferrer"
			>autorisations de votre compte Google</a
		>.
	</li>
</ul>

<h3 id="changes">Modifications de cette politique</h3>
<p>
	Lorsque nous modifions cette politique de manière importante, nous mettons à jour sa date et sa
	version, vous en informons sur le site ou par e-mail avant que la modification ne s'applique, et
	vous demandons d'accepter les nouvelles conditions lors de votre prochaine inscription ou création
	d'un portfolio, ou depuis la page de votre compte. Cette version s'applique depuis le
	{legalLastUpdated(lang)}.
</p>
