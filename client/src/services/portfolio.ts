import { edenTreaty } from '@elysiajs/eden'
import type { Portfolio } from 'portfolio-api'

import { env } from '$env/dynamic/public'

const api = edenTreaty<Portfolio>(env.PUBLIC_PORTFOLIO_API_URL)


export { api }