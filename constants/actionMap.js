/**
 * Updated actionMap to support both GitHub and GitLab events
 */
export const actionMap = {
    // GitHub events
    'opened': (req) => {
        if (req.body.pull_request && !req.body.pull_request.draft) {
            return 'initial';
        }
    },
    'ready_for_review': (req) => {
        return 'initial';
    },
    'review_requested': (req) => {
        return 'initial';
    },
    'synchronize': (req) => {
        return 'update';
    },
    'submitted': (req) => {
        return 'update';
    },

    // GitLab events (object_attributes.action)
    'open': (req) => {
        if (req.body.object_attributes && !req.body.object_attributes.work_in_progress) {
            return 'initial';
        }
    },
    'reopen': (req) => {
        return 'initial';
    },
    'update': (req) => {
        // Check if it's a code update
        if (req.body.object_attributes?.oldrev !== req.body.object_attributes?.newrev) {
            return 'update';
        }
        return undefined;
    },
    'note': (req) => {
        // GitLab comments
        return 'update';
    }
};
