export class BitbucketProvider {
    /**
     * Validates that we have access to this repo
     */
    validateAccess(req) { }

    /**
     * Extracts pull request data from the Bitbucket webhook request
     */
    fetchPullRequestData(req) { }

    /**
     * Returns the assignee username from the webhook request
     */
    getAssignee(req) { }

    /**
     * Returns the repository URL from the webhook request
     */
    getRepoUrl(req) { }

    /**
     * Parses and returns the comment list in tree format
     */
    getCommentTree(req) { }
}