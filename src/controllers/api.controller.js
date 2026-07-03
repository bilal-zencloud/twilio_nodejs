/**
 * JSON API controller — consumed by the Next.js frontend (auth-required).
 * Tenant scope comes from req.accountId (set by authMiddleware from the
 * authenticated admin's account_id), never from client query params.
 */
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const { confirmLead } = require('../services/confirm.service');
const photoService = require('../services/photo.service');

function buildPhotoUrl(_req, leadId, photoId) {
  return `/api/leads/${leadId}/photos/${photoId}`;
}

const ApiController = {
  listLeads(req, res) {
    const accountId = req.accountId;
    const { leads } = forAccount(accountId);
    const allLeads = leads.findAll();

    res.json({
      accountId,
      leads: allLeads,
      stats: {
        total: allLeads.length,
        pending: allLeads.filter(
          (l) => l.status === LeadRepository.STATUSES.PENDING_CONFIRMATION
        ).length,
        confirmed: allLeads.filter((l) => l.status === LeadRepository.STATUSES.CONFIRMED)
          .length,
        active: allLeads.filter((l) =>
          ['new', 'contacted', 'qualifying', 'captured'].includes(l.status)
        ).length,
      },
    });
  },

  async getLead(req, res) {
    const accountId = req.accountId;
    const { leads, messages, photos } = forAccount(accountId);
    const lead = leads.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Return authenticated API URLs, not S3 URLs. The photo route checks the
    // admin session and tenant scope before streaming the object from S3.
    const leadPhotos = photos.findByLead(lead.id).map((p) => ({
      ...p,
      url: buildPhotoUrl(req, lead.id, p.id),
    }));

    res.json({
      accountId,
      lead,
      messages: messages.findByLead(lead.id),
      photos: leadPhotos,
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
};

module.exports = ApiController;
