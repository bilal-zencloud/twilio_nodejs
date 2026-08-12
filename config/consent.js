/**
 * A2P / carrier-compliant SMS consent copy.
 * Keep wording aligned with the approved campaign disclosure.
 *
 * Voice greeting is played from assets/audio/voicemail-greeting.mp3 (owner recording).
 * VOICEMAIL_GREETING below is the script of that recording and a TTS fallback.
 */
const VOICEMAIL_GREETING =
  "Hi, you've reached Preferred Paintless Services. I'm sorry I missed your call. " +
  "Please listen to this message until the end. In just a moment, you'll receive a text message " +
  "asking you to reply YES if you'd like to continue your paintless dent repair request by text. " +
  'If you prefer, you can also leave a voicemail after the tone with your name, phone number, ' +
  'and a brief description of your vehicle and the damage. Thank you, and we look forward to helping you.';

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
  "Thank you for confirming. We're happy to help with your paintless dent repair request. " +
  "To get started, could you tell us a little about the dent or hail damage you're looking to have repaired?";

/** Permanent consent proof labels stored on the lead. */
const CONSENT_STATUS = {
  VERIFIED: 'VERIFIED',
  OPTED_OUT: 'OPTED_OUT',
};

const CONSENT_METHOD = 'Missed Call Double Opt-In';
const CONSENT_SOURCE = 'Missed Call';

/** Public path Twilio fetches for the owner-recorded greeting (mounted on the API). */
const VOICEMAIL_GREETING_AUDIO_PATH = '/media/voicemail-greeting.mp3';

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
  VOICEMAIL_GREETING_AUDIO_PATH,
};
