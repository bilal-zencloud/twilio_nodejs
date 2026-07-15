/**
 * A2P / carrier-compliant SMS consent copy.
 * Keep wording aligned with the approved campaign disclosure.
 */
const VOICEMAIL_GREETING =
  "Thank you for calling Preferred Paintless Services. We're sorry we missed your call. " +
  "We're sending you one text message now asking whether you'd like to continue your " +
  'Paintless Dent Repair request by text. To opt in, simply reply YES. If you do not reply YES, ' +
  'you will not receive any additional text messages regarding this request. Message frequency varies. ' +
  'Message and data rates may apply. Reply STOP to opt out or HELP for help. ' +
  'Please leave your name, phone number, and a brief description of your vehicle after the tone.';

const OPT_IN_SMS =
  'Preferred Paintless Services: Thanks for calling us. Reply YES to continue your paintless dent repair ' +
  'request by text. If you do not reply YES, you will not receive any additional text messages regarding ' +
  'this request. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';

const HELP_SMS =
  'Preferred Paintless Services: Reply YES to continue your service request by text. Reply STOP to opt out. ' +
  'Call (903) 280-7223 if you need immediate assistance.';

const CLARIFICATION_SMS =
  "Preferred Paintless Services: We didn't recognize your response. Please reply YES if you would like to " +
  'continue your service request by text. Reply STOP to opt out or HELP for help.';

const VOICEMAIL_THANKS = 'Thank you for your message. Goodbye.';

const STOP_ACK_SMS =
  'You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.';

const START_ACK_SMS =
  'You have successfully been re-subscribed to messages from this number. Reply HELP for help. Reply STOP to unsubscribe. Msg&Data rates may apply.';

/** Fixed first SMS after the caller replies YES (not AI-generated). */
const POST_OPT_IN_SMS =
  "Thank you for confirming. To get started, could you tell us a little about the dent or hail damage you're looking to have repaired? Thanks.";

/** Permanent consent proof labels stored on the lead. */
const CONSENT_STATUS = {
  VERIFIED: 'VERIFIED',
  OPTED_OUT: 'OPTED_OUT',
};

const CONSENT_METHOD = 'Missed Call Double Opt-In';
const CONSENT_SOURCE = 'Missed Call';

module.exports = {
  VOICEMAIL_GREETING,
  OPT_IN_SMS,
  HELP_SMS,
  CLARIFICATION_SMS,
  VOICEMAIL_THANKS,
  STOP_ACK_SMS,
  START_ACK_SMS,
  POST_OPT_IN_SMS,
  CONSENT_STATUS,
  CONSENT_METHOD,
  CONSENT_SOURCE,
};
