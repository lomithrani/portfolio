import { edenTreaty } from '@elysiajs/eden'
import type { Portfolio } from '../../../Server'

const api = edenTreaty<Portfolio>("http://localhost:3000")

export { api }