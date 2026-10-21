import { cache } from 'react';

import { loadSharedRoundup } from '../../../lib/reader/loadEdition';

/** The shared roundup behind /r/<code>, loaded once per request (page, metadata and image share it). */
export const sharedRoundup = cache(async (code: string) => loadSharedRoundup(decodeURIComponent(code)));
