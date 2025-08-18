import { BaseRepoAdapter, NormalizedUser } from "./Base.js";

export class GitLabAdapter extends BaseRepoAdapter {
    constructor(payload) {
        super(payload);
        this._normalizedData = this._normalize();
    }

    _normalize() {
        const data = {
            provider: "gitlab",
            baseApiUrl: this.payload.generated_api_url || "https://gitlab.com/api/v4",
            action: "UNKNOWN",
            author: null,
            reviewers: [],
            repo: {},
            projectId: null,
            mergeRequestId: null,
            diffUrl: null,
            threadsUrl: null,
            reviewersUrl: null,
            reviewsUrl: null,
            headers: {
                "PRIVATE-TOKEN": process.env.GITLAB_TOKEN,
                "Content-Type": "application/json"
            },
            agent: process.env.GITLAB_AGENT_USER,
            commentProperties: ['id', 'parent_id', 'body', 'position.new_path', 'position.position_type',
                'position.new_line', 'position.old_line', 'created_at', 'author.username']
        };

        // Map GitLab event types to normalized actions
        const eventType = this.payload.object_attributes?.action || this.payload.event_type;
        switch (eventType) {
            case "open": data.action = "OPENED"; break;
            case "reopen": data.action = "OPENED"; break;
            case "update":
                // Check if it's a code update or just metadata
                if (this.payload.object_attributes?.oldrev !== this.payload.object_attributes?.newrev) {
                    data.action = "UPDATED_CODE";
                } else {
                    data.action = "UPDATED";
                }
                break;
            case "approved": data.action = "APPROVED"; break;
            case "unapproved": data.action = "UNAPPROVED"; break;
            case "merge": data.action = "MERGED"; break;
            case "close": data.action = "CLOSED"; break;
            case "note":
                // GitLab uses 'note' for comments
                data.action = "COMMENTED";
                break;
            default:
                data.action = eventType ? eventType.toUpperCase() : "UNKNOWN";
        }

        const mrData = this.payload.object_attributes || this.payload.merge_request || {};
        data.mergeRequestId = this.payload?.object_attributes?.iid || this.payload?.merge_request?.iid;

        if (this.payload.merge_request.last_commit) {
            data.headSha = this.payload.merge_request.last_commit.id;
        } else if (this.payload.object_attributes.last_commit) {
            data.headSha = this.payload.object_attributes.last_commit.id;
        } else if (this.payload.object_attributes?.newrev) {
            data.headSha = this.payload.object_attributes.newrev;
        }

        // Extract project information
        const projectData = this.payload.project || {};
        if (projectData.id) {
            data.projectId = projectData.id;
            data.repo = {
                owner: projectData.namespace,
                name: projectData.name,
                path_with_namespace: projectData.path_with_namespace
            };
        }

        // Extract author/actor information
        const actorData = this.payload.user || {};
        if (actorData.id) {
            data.author = new NormalizedUser(actorData.id, actorData.username, actorData.name);
        }

        // Handle assignees as reviewers in GitLab
        if (mrData.assignees && Array.isArray(mrData.assignees)) {
            data.reviewers = mrData.assignees.map(assignee =>
                new NormalizedUser(assignee.id, assignee.username, assignee.name)
            );
        }

        // Populate API URLs
        const projectId = data.projectId;
        const mrIid = data.mergeRequestId;
        if (projectId && mrIid) {
            data.prUrl = `${data.baseApiUrl}/projects/${projectId}/merge_requests/${mrIid}`;
            data.diffUrl = `${data.prUrl}/diffs`;
            data.threadsUrl = `${data.prUrl}/discussions`;
            data.reviewersUrl = `${data.prUrl}`;  // GitLab uses the MR endpoint for assignees
            data.reviewsUrl = `${data.prUrl}/approvals`;
            data.notesUrl = `${data.prUrl}/notes`;
            data.versionsUrl = `${data.prUrl}/versions`;
        }
        console.log(data);

        return data;
    }

    get provider() { return this._normalizedData.provider; }
    get baseApiUrl() { return this._normalizedData.baseApiUrl; }
    get pullRequestNumber() { return this._normalizedData.mergeRequestId; }
    get action() { return this._normalizedData.action; }
    get author() { return this._normalizedData.author; }
    get reviewers() { return this._normalizedData.reviewers; }
    get prUrl() { return this._normalizedData.prUrl; }
    get diffUrl() { return this._normalizedData.diffUrl; }
    get threadsUrl() { return this._normalizedData.threadsUrl; }
    get reviewersUrl() { return this._normalizedData.reviewersUrl; }
    get reviewsUrl() { return this._normalizedData.reviewsUrl; }
    get headers() { return this._normalizedData.headers; }
    get sha() { return this._normalizedData.headSha; }
    get commentProperties() { return this._normalizedData.commentProperties; }
    get projectId() { return this._normalizedData.projectId; }
    get mergeRequestId() { return this._normalizedData.mergeRequestId; }

    get llmResponse() { return this._llmResponse; }
    set llmResponse(val) { this._llmResponse = val; }

    get diff() { return this._diff; }
    set diff(val) { this._diff = val; }

    get tree() { return this._tree; }
    set tree(val) { this._tree = val; }

    async isAuthenticated() {
        try {
            const res = await this.http.get(
                `${this.baseApiUrl}/projects/${this.projectId}`,
                this.headers
            );
            return res.status === 200;
        } catch (err) {
            return false;
        }
    }

    async getDiff() {
        try {
            const res = await this.http.get(
                this.diffUrl,
                this.headers
            );
            if (res.status !== 200) return false;

            const gitlabDiffs = res.data;
            const diffs = gitlabDiffs.map(file => {
                const changes = [];

                if (file.diff) {
                    const lines = file.diff.split('\n');
                    let oldLine = 0;
                    let newLine = 0;

                    for (const line of lines) {
                        if (line.startsWith('@@')) {
                            // Parse hunk header
                            const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                            if (match) {
                                oldLine = parseInt(match[1]);
                                newLine = parseInt(match[2]);
                            }
                            continue;
                        }

                        let side, lineNum, type;

                        if (line.startsWith('+')) {
                            side = "RIGHT";
                            lineNum = newLine++;
                            type = "add";
                        } else if (line.startsWith('-')) {
                            side = "LEFT";
                            lineNum = oldLine++;
                            type = "del";
                        } else {
                            oldLine++;
                            newLine++;
                            continue;
                        }

                        changes.push({
                            side,
                            line: lineNum,
                            type,
                            content: line.substring(1),
                        });
                    }
                }

                return {
                    filePath: file.new_path || file.old_path,
                    changes,
                };
            });

            this.diff = diffs;
            return diffs;
        } catch (err) {
            this.logger.error(`Error getting diff: ${err.message}`);
            return false;
        }
    }

    async getCommentTree() {
        try {
            const discussions = (await this.http.get(
                this.threadsUrl,
                this.headers
            )).data;

            const tree = [];

            for (const discussion of discussions) {
                if (!discussion.notes || discussion.notes.length === 0) continue;

                const rootNote = discussion.notes[0];
                const commentData = {
                    id: rootNote.id,
                    body: rootNote.body,
                    created_at: rootNote.created_at,
                    'author.username': rootNote.author?.username,
                    children: []
                };

                // Add position data if it's a diff comment
                if (rootNote.position) {
                    commentData['position.new_path'] = rootNote.position.new_path;
                    commentData['position.new_line'] = rootNote.position.new_line;
                    commentData['position.old_line'] = rootNote.position.old_line;
                    commentData['position.position_type'] = rootNote.position.position_type;
                }

                // Add replies as children
                for (let i = 1; i < discussion.notes.length; i++) {
                    const reply = discussion.notes[i];
                    commentData.children.push({
                        id: reply.id,
                        parent_id: rootNote.id,
                        body: reply.body,
                        created_at: reply.created_at,
                        'author.username': reply.author?.username,
                    });
                }

                tree.push(commentData);
            }

            this.tree = tree;
            return tree;
        } catch (err) {
            this.logger.error(`Error getting comment tree: ${err.message}`);
            return [];
        }
    }

    async getLLMResponse(actionType) {
        this.llmResponse = await this.doLLM(this.diff, "", actionType, this.tree, this._normalizedData.agent);
    }

    async doPostProcessingActions() {
        const response = this.llmResponse;

        if (Array.isArray(response.newReviews)) {
            for (const comment of response.newReviews) {
                if (comment.filePath && comment.line) {
                    try {
                        await this.postReviewComments({
                            body: comment.message,
                            position: {
                                ...(await this.getMergeRequestVersions()),
                                head_sha: this.sha,
                                position_type: "text",
                                new_path: comment.filePath,
                                new_line: comment.line,
                                old_line: comment.side === "LEFT" ? comment.line : null
                            }
                        });
                    } catch (e) {
                        this.logger.error(`Error posting review comment: ${e.message}`);
                        throw e;
                    }
                }
            }
        }

        if (Array.isArray(response.comments)) {
            for (const comment of response.comments) {
                if (comment.commentId && comment.message) {
                    try {
                        await this.postReviewCommentUpdates({
                            commentId: comment.commentId,
                            resolveReviewThread: comment.resolveReviewThread,
                            message: comment.message,
                        });
                    } catch (e) {
                        this.logger.error(`Error updating comment: ${e.message}`);
                        throw e;
                    }
                }
            }
        }

        if (response.approved) {
            await this.submitReview("approved", response.baseMessage);
        }
    }

    async postNewReviewer() {
        const url = this.reviewersUrl;
        const payload = {
            reviewer_ids: [await this.getAgentUserId()]
        };

        try {
            await this.http.put(url, payload, this.headers);
        } catch (error) {
            this.logger.error(`Error adding reviewer: ${error.message}`);
            throw error;
        }
    }

    async getAgentUserId() {
        const url = `${this.baseApiUrl}/users?username=${this._normalizedData.agent}`;

        try {
            const res = await this.http.get(url, this.headers);
            if (res.data && res.data.length > 0) {
                return res.data[0].id;
            }
            throw new Error(`Agent user ${this._normalizedData.agent} not found`);
        } catch (error) {
            this.logger.error(`Error getting agent user ID: ${error.message}`);
            throw error;
        }
    }

    async getMergeRequestVersions() {
        const url = this._normalizedData.versionsUrl;

        try {
            const res = await this.http.get(url, this.headers);
            if (Array.isArray(res.data) && res.data.length > 0) {
                // The most recent version is usually first
                const latest = res.data[0];
                return {
                    base_sha: latest.base_commit_sha || latest.start_commit_sha,
                    start_sha: latest.start_commit_sha,
                };
            }
            throw new Error(`No versions found for MR at ${url}`);
        } catch (error) {
            this.logger.error(`Error getting merge request versions: ${error.message}`);
            throw error;
        }
    }

    async postReviewComments(payload) {
        const url = this.threadsUrl;

        try {
            console.log(payload);
            const res = await this.http.post(url, payload, this.headers);
            return res.status === 201 ? res.data : false;
        } catch (error) {
            this.logger.error(`Error posting review comment: ${error.message}`);
            throw error;
        }
    }

    async postReviewCommentUpdates(payload) {
        const { commentId, message, resolveReviewThread } = payload;

        // Find the discussion that contains this comment
        const discussions = (await this.http.get(
            this.threadsUrl,
            this.headers
        )).data;

        let discussionId = null;
        for (const discussion of discussions) {
            if (discussion.notes.some(note => note.id === commentId)) {
                discussionId = discussion.id;
                break;
            }
        }

        if (!discussionId) {
            throw new Error(`Discussion not found for comment ${commentId}`);
        }

        // Post reply to the discussion
        const url = `${this.threadsUrl}/${discussionId}/notes`;
        await this.http.post(url, { body: message }, this.headers);

        if (resolveReviewThread) {
            await this.resolveThread(discussionId);
        }
    }

    async resolveThread(discussionId) {
        const url = `${this.threadsUrl}/${discussionId}`;

        try {
            await this.http.put(url, { resolved: true }, this.headers);
        } catch (error) {
            this.logger.error(`Error resolving thread: ${error.message}`);
            throw error;
        }
    }

    async submitReview(event, message) {
        // Post a general comment
        const notesUrl = `${this.prUrl}/notes`;
        await this.http.post(notesUrl, { body: message }, this.headers);

        // If approved, add approval
        if (event === "approved") {
            const approvalUrl = `${this.prUrl}/approve`;
            try {
                await this.http.post(approvalUrl, {}, this.headers);
            } catch (e) {
                this.logger.error(`Error submitting approval: ${e.message}`);
                throw e;
            }
        }
    }
}