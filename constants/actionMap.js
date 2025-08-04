/**
 * This particular export is a map that maps incoming events from ALL supported providers
 * to an internal event type.
 * 
 * initial is the pr opening, or being undrafted. 
 * It tells the bot to do it's initial assessment and leave comments.
 */
export const actionMap = {
    'opened': (req) => {
        if (
            !req.body.pull_request.draft
        ) {
            return 'initial';
        }
    },
    'ready_for_review': (req) => {
        return 'initial';
    },
    'synchronize': (req) => {
        return 'update';
    },
    'submitted': (req) => {
        return 'update';
    }
}
