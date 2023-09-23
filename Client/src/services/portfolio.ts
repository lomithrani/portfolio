import { edenTreaty } from '@elysiajs/eden'
import type { Portfolio } from '../../../Server'

import { PUBLIC_PORTFOLIO_API_URL } from '$env/static/public'

const api = edenTreaty<Portfolio>(PUBLIC_PORTFOLIO_API_URL)

export { api }