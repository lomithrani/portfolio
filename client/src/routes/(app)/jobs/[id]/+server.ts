import { opportunityPath } from 'portfolio-common';
import type { RequestHandler } from './$types';

// The address the meeting invitations of a hiring journey linked before the job's private page
// moved to /opportunities/:id (portfolio-common's opportunityPath, which the invitations link
// now): an invitation already in a calendar keeps working. 308: a permanent move, which search
// engines follow and drop the old address for; the query (`?lang=`) goes along.
export const GET: RequestHandler = ({ params, url }) =>
	new Response(null, {
		status: 308,
		headers: { location: `${opportunityPath(params.id)}${url.search}` }
	});
