export class GitLabProvider {
    /**
     * Validates that we have access to this repo
     */
    validateAccess(req) { }

    /**
     * Extracts pull request data from the GitLab webhook request
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