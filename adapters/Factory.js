// RepoAdapterFactory.js
import { GitHubAdapter } from './GitHubAdapter.js';
import { GitLabAdapter } from './GitLabAdapter.js';
import { BitbucketAdapter } from './BitbucketAdapter.js';

export function getAdapter(payload, headers) {
    console.log(payload, headers);
    if ('x-github-event' in headers) {
        return new GitHubAdapter(payload);
    } else if ('x-gitlab-event' in headers) {
        return new GitLabAdapter(payload);
    } else if ('x-event-key' in headers) {
        return new BitbucketAdapter(payload);
    }
    return null;
}