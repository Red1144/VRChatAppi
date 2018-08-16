/**
 * Request cache
 * @type {Array}
 */
const lastRequests = [];

/**
 * Calculate when you can send another request
 * @param ident             Identification for the request
 * @returns {string}        When next request can be sent in seconds
 */
function whenNextRequest(ident) {
	const time = getEpoch();
	for (let i = 0; i < lastRequests.length; i++) {
		const req = lastRequests[i];
		if (req.type === ident) {
			if (time < (req.sentAt + 60000)) {
				return Math.floor((((req.sentAt + 60000) - time) / 1000)) + " seconds"
			}
		}
	}
	return "now";
}

/**
 * Determine if you can send the requests
 * @param ident             Identification for the request
 * @returns {boolean}       If the request can be sent
 */
function canSendRequests(ident) {
	const time = getEpoch();
	for (let i = 0; i < lastRequests.length; i++) {
		const req = lastRequests[i];
		if (req.type === ident) {
			if (time < (req.sentAt + 60000)) {
				return false;
			}
		}
	}
	lastRequests.push({
		type: ident,
		sentAt: time
	});
	return true;
}

/**
 * Get the current time in milliseconds
 * @returns {number}
 */
function getEpoch () {
	return (new Date).getTime();
}