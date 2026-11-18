<!--
@component
Conditions d'utilisation (français), traduction fidèle de TermsEn.svelte : conditions d'âge et
d'âge légal de travail, le service (les candidats ne paient jamais, L5321-3 ; gratuit pour les
recruteurs pour l'instant ; aucune exclusivité), comptes et portfolios, contenus et licence,
contenus interdits (offres discriminatoires, mineurs), recruteurs (acceptation à l'ouverture de
l'espace recruteur ; poste réel, rémunération réellement proposée, aucune limite d'âge supérieure,
droit d'agir pour l'employeur ; l'activité est du placement, L5321-1 : le site met en relation, ne
prend pas part à l'embauche et ne note que des offres, au regard des critères propres d'un
candidat), imports, rendez-vous, modération (DSA art. 14, 16, 17), résiliation, responsabilité,
modifications, droit applicable.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'about', title: 'À propos de ces conditions' },
		{ id: 'eligibility', title: 'Qui peut utiliser le site' },
		{ id: 'service', title: 'Le service' },
		{ id: 'account', title: 'Votre compte et votre portfolio' },
		{ id: 'content', title: 'Vos contenus' },
		{ id: 'prohibited', title: 'Ce qui est interdit' },
		{ id: 'recruiters', title: "Offres d'emploi et recruteurs" },
		{ id: 'imports', title: "Imports de CV et d'offres d'emploi" },
		{ id: 'meetings', title: 'Parcours de recrutement et rendez-vous' },
		{ id: 'moderation', title: 'Signalements et modération' },
		{ id: 'termination', title: 'Suppression du compte, suspension' },
		{ id: 'liability', title: 'Responsabilité' },
		{ id: 'changes', title: 'Modifications de ces conditions' },
		{ id: 'law', title: 'Droit applicable et litiges' },
		{ id: 'contact', title: 'Contact' }
	];
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { LEGAL_VERSION, MINIMUM_AGE } from 'portfolio-common';
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import { SITE_NAME, legalLastUpdated, type LegalPublisher } from '../legalDocuments.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'fr';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="about">À propos de ces conditions</h3>
<p>
	Ces conditions d'utilisation fixent les règles entre vous et l'éditeur de {SITE_NAME} (voir les
	<LegalDocLink doc="notice" {lang}>mentions légales</LegalDocLink>) lorsque vous utilisez le site.
	Vous les acceptez en cochant la case de confirmation lorsque le site vous le demande (lors de
	votre inscription depuis la page d'accueil, de la création d'un portfolio ou de l'ouverture de
	l'espace recruteur), et en utilisant un compte. Il s'agit de la version {LEGAL_VERSION}, en
	vigueur depuis le {legalLastUpdated(lang)}. La manière dont nous traitons les données personnelles
	est expliquée dans la
	<LegalDocLink doc="privacy" {lang}>politique de confidentialité</LegalDocLink>.
</p>

<h3 id="eligibility">Qui peut utiliser le site</h3>
<p>
	Toute personne qui a l'adresse d'un portfolio peut le lire. Pour créer un compte, vous devez :
</p>
<ul>
	<li>
		avoir au moins <strong>{MINIMUM_AGE} ans</strong> et avoir atteint
		<strong>l'âge légal minimum pour travailler dans votre pays</strong>, ce que vous confirmez
		lorsque le site vous le demande (lors de l'inscription depuis la page d'accueil, de la création
		d'un portfolio ou de l'ouverture de l'espace recruteur) ;
	</li>
	<li>avoir un compte Google, avec lequel vous vous connectez ;</li>
	<li>
		si vous rédigez des offres d'emploi pour une organisation, être autorisé à agir en son nom.
	</li>
</ul>
<p>
	Utiliser un compte signifie que vous remplissez ces conditions, que le site vous ait demandé de
	les confirmer ou non. Le site ne s'adresse pas aux personnes plus jeunes. Nous supprimons les
	comptes dont nous apprenons qu'ils appartiennent à une personne qui ne remplit pas ces conditions.
</p>

<h3 id="service">Le service</h3>
<p>
	{SITE_NAME} permet aux candidats de publier un portfolio de leurs expériences et projets à leur propre
	adresse, avec une frise chronologique et des filtres par compétence, et de définir un parcours de recrutement
	que les recruteurs suivent avant de réserver un rendez-vous avec eux. Les recruteurs rédigent des offres
	d'emploi et en présentent une à un candidat en la choisissant sur la page Recruter de ce candidat, où
	son parcours peut la noter au regard du poste qu'il recherche. Le site ne publie pas d'offres d'emploi.
</p>
<p>
	<strong>Les candidats ne paient jamais</strong> le service : la loi française interdit d'exiger
	des personnes à la recherche d'un emploi une quelconque rétribution, directe ou indirecte, en
	contrepartie de services de placement (article L5321-3 du code du travail). Le service est
	actuellement <strong>gratuit pour les recruteurs</strong> aussi ; nous préviendrons un recruteur
	avant qu'une fonctionnalité payante ne s'applique à lui, et ne lui facturerons rien qu'il n'ait
	accepté. Il n'y a <strong>aucune exclusivité</strong> : candidats et recruteurs sont libres d'utiliser
	d'autres services en même temps, et de se contacter ou de conclure un contrat sans passer par le site.
</p>
<p>
	Le service est fourni <strong>en l'état</strong>. Nous faisons en sorte qu'il reste disponible et
	correct, mais nous ne garantissons pas qu'il soit toujours disponible ni exempt d'erreurs, et nous
	pouvons modifier, limiter ou arrêter des fonctionnalités, en vous prévenant à l'avance lorsqu'un
	changement vous affecte de manière importante. Le site aide candidats et recruteurs à se
	rencontrer ; il ne garantit ni un emploi, ni un candidat, ni un rendez-vous, et il n'est partie à
	aucun contrat conclu entre eux.
</p>

<h3 id="account">Votre compte et votre portfolio</h3>
<ul>
	<li>Un compte peut posséder un seul portfolio, à une seule adresse.</li>
	<li>
		Les adresses sont attribuées au premier arrivé. Certaines sont réservées au site. Nous pouvons
		reprendre une adresse qui usurpe l'identité d'une personne, porte atteinte à une marque ou
		trompe les visiteurs.
	</li>
	<li>
		Vous êtes responsable de l'utilisation de votre compte. Déconnectez-vous sur les appareils
		partagés, et prévenez-nous si vous pensez que quelqu'un d'autre l'a utilisé.
	</li>
</ul>

<h3 id="content">Vos contenus</h3>
<p>
	Vous conservez tous vos droits sur ce que vous mettez sur le site : portfolio, expériences et
	projets, notes de parcours, offres d'emploi. Vous accordez à l'éditeur une licence gratuite, non
	exclusive et mondiale pour héberger, stocker, reproduire et afficher ces contenus sur le site, et
	les montrer aux personnes auxquelles ils sont destinés (un portfolio à toute personne qui a son
	adresse, une offre d'emploi aux candidats dans le parcours de recrutement desquels elle est
	choisie), tant qu'ils sont en ligne. La licence prend fin lorsque vous supprimez le contenu ou
	votre compte.
</p>
<p>Vous êtes responsable de vos contenus. En particulier, vous confirmez que :</p>
<ul>
	<li>
		ils sont exacts et ne trompent pas sur votre expérience, vos compétences ou votre identité ;
	</li>
	<li>
		vous avez le droit de les publier (textes, logos, images) et ils respectent la loi et les droits
		des autres ;
	</li>
	<li>
		vous comprenez qu'un portfolio est public : toute personne qui a son adresse peut le lire, même
		si les moteurs de recherche sont priés de ne pas le référencer. Ne publiez pas d'informations
		que vous voulez garder privées, comme des données de santé, des opinions religieuses ou
		politiques, des numéros d'identité ou une adresse personnelle.
	</li>
</ul>
<p>
	Les suggestions d'étapes et les avis que vous envoyez sont publiés sous forme de tickets publics
	sur GitHub, dans le dépôt du projet, sans votre nom (voir la
	<LegalDocLink doc="privacy" {lang} hash="data-feedback">politique de confidentialité</LegalDocLink
	>). Vous accordez à l'éditeur la même licence pour les y publier et les utiliser afin d'améliorer
	le site ; elle ne prend pas fin avec votre compte, mais vous pouvez nous demander de retirer un
	ticket. N'y écrivez rien que vous voulez garder privé, aucune donnée personnelle d'autrui et rien
	d'illicite : nous pouvons retirer un ticket qui enfreint ces conditions.
</p>

<h3 id="prohibited">Ce qui est interdit</h3>
<p>Vous ne devez pas utiliser le site pour :</p>
<ul>
	<li>
		publier des contenus illicites, tels que des propos haineux, du harcèlement, de la diffamation,
		des contenus sexualisant des mineurs, ou des contenus portant atteinte à la propriété
		intellectuelle ou à la vie privée ;
	</li>
	<li>
		usurper l'identité d'une personne, créer un portfolio au nom de quelqu'un d'autre sans son
		accord, ou mentir sur votre identité ;
	</li>
	<li>publier les données personnelles d'autres personnes sans base légale ;</li>
	<li>
		rédiger ou partager des offres d'emploi discriminatoires, c'est-à-dire qui sélectionnent les
		candidats selon leur origine, leur sexe, leur orientation sexuelle, leur identité de genre, leur
		âge, leur situation de famille, leur grossesse, leur handicap, leur état de santé, leurs
		convictions religieuses, leurs opinions politiques, leurs activités syndicales, leur apparence
		physique, leur nom de famille, leur lieu de résidence ou tout autre critère interdit par
		l'article L1132-1 du code du travail ou par la loi applicable au poste ;
	</li>
	<li>
		viser des personnes n'ayant pas atteint l'âge légal pour travailler, ou proposer à des personnes
		de moins de 18 ans des travaux que la loi interdit aux mineurs ;
	</li>
	<li>
		rédiger ou partager de fausses offres d'emploi, des arnaques, ou demander de l'argent aux
		candidats ;
	</li>
	<li>
		envoyer du spam, de la publicité non sollicitée, ou réserver des rendez-vous auxquels vous ne
		comptez pas vous rendre ;
	</li>
	<li>
		collecter des portfolios ou des offres d'emploi par des moyens automatisés (scraping), en dehors
		des moteurs de recherche qui respectent les règles du site (il leur demande de ne pas référencer
		les portfolios) et de l'aperçu d'un lien partagé ;
	</li>
	<li>
		attaquer, surcharger ou sonder le site, contourner ses limites et quotas, ou détourner les
		imports (par exemple en envoyant des documents qui ne sont ni des CV ni des offres d'emploi, ou
		que vous n'avez pas le droit d'utiliser) ;
	</li>
	<li>diffuser des logiciels malveillants ou des liens vers des sites malveillants.</li>
</ul>

<h3 id="recruiters">Offres d'emploi et recruteurs</h3>
<p>
	Pour ouvrir l'espace recruteur, les recruteurs acceptent ces conditions (le site les leur demande
	alors, sauf s'ils ont déjà accepté la version en vigueur), et les acceptent de nouveau
	lorsqu'elles changent de manière importante, avant d'utiliser de nouveau l'espace. Les recruteurs
	sont responsables de leurs offres d'emploi et s'engagent à :
</p>
<ul>
	<li>
		décrire un <strong>poste réel</strong>, ouvert ou sur le point de l'être, avec le contrat et les
		conditions réellement proposés ;
	</li>
	<li>
		indiquer la <strong>rémunération réellement proposée</strong> : une offre ne doit pas induire en erreur
		sur le poste, sa rémunération, son lieu de travail ou tout autre élément qu'elle propose (article
		L5331-3 du code du travail) ;
	</li>
	<li>
		ne fixer <strong>aucune limite d'âge supérieure</strong>, sauf si la loi en fixe une (article
		L5331-2 du code du travail), ni aucun autre critère discriminatoire, dont l'âge (voir
		<a class="link-text" href="#prohibited">ce qui est interdit</a>) ;
	</li>
	<li>
		être l'employeur, ou être <strong>autorisés à agir en son nom</strong> ;
	</li>
	<li>respecter le droit du travail.</li>
</ul>
<p>
	Une fois une offre d'emploi ouverte, sa rémunération et ses conditions ne peuvent plus être
	modifiées, car les correspondances des candidats sont calculées sur elles : une nouvelle version
	de celles-ci est une nouvelle offre d'emploi.
</p>
<p>
	Avant d'embaucher, les recruteurs doivent vérifier que le candidat est légalement autorisé à
	occuper le poste, notamment son âge et son droit au travail.
</p>
<p>
	En rapprochant des offres d'emploi et des personnes à la recherche d'un emploi, le site exerce une
	activité de placement au sens de l'article L5321-1 du code du travail : il met en relation
	candidats et recruteurs. L'éditeur ne prend part à aucune de leurs décisions, notamment
	d'embauche, n'est pas l'employeur et n'est pas partie au contrat de travail qui peut en découler.
	Le site n'évalue pas les candidats, et ne les classe ni ne les filtre. La seule note qu'il calcule
	est celle d'une offre d'emploi, au regard des critères qu'un candidat a fixés pour le poste qu'il
	recherche, lorsque le candidat ajoute l'étape « Correspondre au poste idéal » à son parcours de
	recrutement : selon des règles fixes, et non par un modèle d'IA, avec le minimum choisi par le
	candidat (voir la
	<LegalDocLink doc="privacy" {lang} hash="ai">politique de confidentialité</LegalDocLink>).
</p>

<h3 id="imports">Imports de CV et d'offres d'emploi</h3>
<p>
	Les imports envoient votre PDF à Claude, un modèle d'IA conçu par Anthropic, qui propose des
	brouillons. Les brouillons peuvent être incomplets ou erronés : relisez-les avant de les ajouter,
	car vous êtes responsable de ce que vous mettez sur le site. N'envoyez que des documents que vous
	avez le droit d'utiliser. Le nombre d'imports est limité, et nous pouvons suspendre la
	fonctionnalité, par exemple pour empêcher les abus.
</p>

<h3 id="meetings">Parcours de recrutement et rendez-vous</h3>
<p>
	Le propriétaire d'un portfolio qui propose des rendez-vous connecte son agenda Google. Lorsqu'un
	visiteur réserve, son nom, son adresse e-mail et sa note figurent dans l'invitation de l'agenda du
	propriétaire. Les propriétaires ne doivent utiliser ces informations que pour organiser le
	rendez-vous et le processus de recrutement qui suit, dans le respect du droit de la protection des
	données. Les visiteurs ne réservent que des rendez-vous auxquels ils comptent se rendre, et les
	annulent dans le cas contraire.
</p>

<h3 id="moderation">Signalements et modération</h3>
<p>
	Nous ne vérifions pas les contenus avant leur publication, et aucun outil automatisé ne les
	modère. Toute personne peut signaler un contenu qu'elle estime illicite ou contraire à ces
	conditions, comme indiqué dans les
	<LegalDocLink doc="notice" {lang} hash="report">mentions légales</LegalDocLink>. Une personne
	examine chaque signalement.
</p>
<p>
	Lorsqu'un contenu est illicite ou enfreint ces conditions, nous pouvons le retirer ou en
	restreindre l'accès, et suspendre ou fermer le compte, en proportion de la gravité et de la
	répétition du manquement. Nous en informons alors la personne concernée par e-mail, sauf si la loi
	l'interdit, avec un exposé des motifs : ce que nous avons décidé et sa portée, les faits et
	circonstances, le fondement légal ou la clause de ces conditions invoqués, l'absence de moyens
	automatisés, et les moyens de contester.
</p>
<p>
	Vous pouvez contester une décision, ou notre refus de donner suite à votre signalement, dans un
	délai de six mois en répondant à notre e-mail ou en écrivant à <ContactEmail
		{publisher}
		{lang}
	/>. Nous réexaminons la décision et vous répondons. Vous pouvez aussi saisir la justice.
</p>

<h3 id="termination">Suppression du compte, suspension</h3>
<p>
	Vous pouvez cesser d'utiliser le site et supprimer votre compte à tout moment depuis
	<a class="link-text" href={resolve('/(site)/account')}>la page de votre compte</a>. La suppression
	est immédiate et définitive : votre portfolio et tout ce qui est lié à votre compte sont
	supprimés, et l'adresse de votre portfolio redevient disponible.
</p>
<p>
	Nous pouvons suspendre ou fermer un compte qui enfreint gravement ou de manière répétée ces
	conditions ou la loi, comme indiqué ci-dessus. Sauf urgence (contenu illicite, sécurité,
	protection d'autrui), nous vous prévenons d'abord.
</p>

<h3 id="liability">Responsabilité</h3>
<p>
	Dans la mesure permise par la loi, l'éditeur n'est pas responsable des dommages indirects, de la
	perte de contenus que vous n'avez pas conservés ailleurs, des contenus publiés par les
	utilisateurs, des décisions prises par les recruteurs ou les candidats, ni de ce qui se passe
	entre des personnes qui se rencontrent grâce au site. En tant qu'hébergeur, l'éditeur n'est pas
	responsable des contenus publiés par les utilisateurs dont il ne connaît pas le caractère
	illicite, et agit promptement dès qu'il en est informé.
</p>
<p>
	Rien dans ces conditions ne limite une responsabilité que la loi ne permet pas de limiter (comme
	en cas de faute lourde ou intentionnelle), ni ne vous prive de la protection que vous accorde le
	droit impératif de la consommation de votre pays de résidence.
</p>

<h3 id="changes">Modifications de ces conditions</h3>
<p>
	Lorsque nous modifions ces conditions de manière importante, nous mettons à jour leur date et leur
	version, vous en informons sur le site ou par e-mail avant que la modification ne s'applique, et
	vous demandons d'accepter la nouvelle version lors de votre prochaine inscription ou création d'un
	portfolio, avant d'utiliser de nouveau l'espace recruteur, ou depuis la page de votre compte. Si
	vous ne l'acceptez pas, vous pouvez cesser d'utiliser le site et supprimer votre compte.
</p>

<h3 id="law">Droit applicable et litiges</h3>
<p>
	Ces conditions sont régies par le droit français. Avant toute action en justice, écrivez-nous afin
	que nous recherchions une solution amiable. À défaut, les tribunaux français sont compétents. Si
	vous êtes un consommateur, vous conservez la protection des règles impératives du pays où vous
	résidez, et pouvez aussi saisir ses tribunaux.
</p>

<h3 id="contact">Contact</h3>
<p>
	Pour toute question sur ces conditions : <ContactEmail {publisher} {lang} />.
</p>
