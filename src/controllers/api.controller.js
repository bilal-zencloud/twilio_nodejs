/**
 * JSON API controller — consumed by the Next.js frontend (auth-required).
 * Tenant scope comes from req.accountId (set by authMiddleware from the
 * authenticated admin's account_id), never from client query params.
 */
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const { confirmLead } = require('../services/confirm.service');
const { closeLead } = require('../services/handoff.service');
const photoService = require('../services/photo.service');
const voicemailService = require('../services/voicemail.service');

function buildPhotoUrl(_req, leadId, photoId) {
  return `/api/leads/${leadId}/photos/${photoId}`;
}

function buildVoicemailUrl(_req, leadId, voicemailId) {
  return `/api/leads/${leadId}/voicemails/${voicemailId}`;
}

const ApiController = {
  listLeads(req, res) {
    const accountId = req.accountId;
    const { leads } = forAccount(accountId);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10) || 30, 1), 30);
    const status = req.query.status || 'all';
    const search = (req.query.search || '').trim();
    const total = leads.count({ status, search });
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);
    const pagedLeads = leads.findPage({
      page: safePage,
      limit,
      status,
      search,
    });

    res.json({
      accountId,
      leads: pagedLeads,
      stats: leads.stats(),
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
        status,
        search,
      },
    });
  },

  async getLead(req, res) {
    const accountId = req.accountId;
    const { leads, messages, photos, voicemails } = forAccount(accountId);
    const lead = leads.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const leadPhotos = photos.findByLead(lead.id).map((p) => ({
      ...p,
      url: buildPhotoUrl(req, lead.id, p.id),
    }));

    const leadVoicemails = voicemails.findByLead(lead.id).map((v) => ({
      ...v,
      url: buildVoicemailUrl(req, lead.id, v.id),
    }));

    res.json({
      accountId,
      lead,
      messages: messages.findByLead(lead.id),
      photos: leadPhotos,
      voicemails: leadVoicemails,
      appointmentTypes: LeadRepository.APPOINTMENT_TYPES,
    });
  },

  async confirmLead(req, res) {
    const accountId = req.accountId;
    const leadId = parseInt(req.params.id, 10);
    const { appointment_type: appointmentType, preferred_time: preferredTime } = req.body;

    try {
      const lead = await confirmLead({
        accountId,
        leadId,
        appointmentType,
        preferredTime,
      });

      res.json({ success: true, lead });
    } catch (err) {
      console.error('[api/confirm] Error:', err.message);
      res.status(400).json({ error: err.message });
    }
  },

  closeLead(req, res) {
    const accountId = req.accountId;
    const leadId = parseInt(req.params.id, 10);

    try {
      const lead = closeLead({ accountId, leadId });
      res.json({ success: true, lead });
    } catch (err) {
      console.error('[api/close] Error:', err.message);
      res.status(400).json({ error: err.message });
    }
  },

  async photo(req, res) {
    const accountId = req.accountId;
    const { photos } = forAccount(accountId);
    const photo = photos.findById(req.params.photoId);

    if (!photo || String(photo.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    try {
      const object = await photoService.getPhotoObject(photo);
      if (!object?.body) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      res.setHeader('Content-Type', object.contentType || photo.mime_type || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (object.contentLength) {
        res.setHeader('Content-Length', object.contentLength);
      }

      if (typeof object.body.pipe === 'function') {
        object.body.on('error', (err) => {
          console.error('[api/photo] Stream error:', err.message);
          if (!res.headersSent) res.status(500).end();
        });
        return object.body.pipe(res);
      }

      const chunks = [];
      for await (const chunk of object.body) {
        chunks.push(Buffer.from(chunk));
      }
      return res.send(Buffer.concat(chunks));
    } catch (err) {
      console.error('[api/photo] Error:', err.message);
      return res.status(404).json({ error: 'Photo not found' });
    }
  },

  async voicemail(req, res) {
    const accountId = req.accountId;
    const { voicemails } = forAccount(accountId);
    const recording = voicemails.findById(req.params.voicemailId);

    if (!recording || String(recording.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    try {
      const object = await voicemailService.getVoicemailObject(recording);
      if (!object?.body) {
        return res.status(404).json({ error: 'Voicemail not found' });
      }

      res.setHeader('Content-Type', object.contentType || 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (object.contentLength) {
        res.setHeader('Content-Length', object.contentLength);
      }

      if (typeof object.body.pipe === 'function') {
        object.body.on('error', (err) => {
          console.error('[api/voicemail] Stream error:', err.message);
          if (!res.headersSent) res.status(500).end();
        });
        return object.body.pipe(res);
      }

      const chunks = [];
      for await (const chunk of object.body) {
        chunks.push(Buffer.from(chunk));
      }
      return res.send(Buffer.concat(chunks));
    } catch (err) {
      console.error('[api/voicemail] Error:', err.message);
      return res.status(404).json({ error: 'Voicemail not found' });
    }
  },
};

module.exports = ApiController;
