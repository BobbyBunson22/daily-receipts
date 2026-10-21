import { cache } from 'react';

import { loadSharedStory } from '../../../lib/reader/loadEdition';
import { storyIdFrom } from '../../../lib/reader/share';

/** The shared story behind /s/<id>-<words>, loaded once per request (page, metadata and image share it). */
export const sharedStory = cache(async (segment: string) => {
  const id = storyIdFrom(decodeURIComponent(segment));
  return id ? loadSharedStory(id) : null;
});
