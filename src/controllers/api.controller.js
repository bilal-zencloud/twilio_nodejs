/**
 * JSON API controller — consumed by the Next.js frontend.
 * All endpoints are tenant-scoped via account_id.
 */
const config = require('../../config/env');
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const { confirmLead } = require('../services/confirm.service');
const photoService = require('../services/photo.service');

function getAccountId(req) {
  return req.query?.account_id || req.body?.account_id || config.defaultAccountId;
}

function buildPhotoUrl(req, leadId, photoId, accountId) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/api/leads/${leadId}/photos/${photoId}?account_id=${accountId}`;
}

const ApiController = {
  listLeads(req, res) {
    const accountId = getAccountId(req);
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

  getLead(req, res) {
    const accountId = getAccountId(req);
    const { leads, messages, photos } = forAccount(accountId);
    const lead = leads.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const leadPhotos = photos.findByLead(lead.id).map((p) => ({
      ...p,
      url: buildPhotoUrl(req, lead.id, p.id, accountId),
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
    const accountId = getAccountId(req);
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

  photo(req, res) {
    const accountId = getAccountId(req);
    const { photos } = forAccount(accountId);
    const photo = photos.findById(req.params.photoId);

    if (!photo || String(photo.lead_id) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    try {
      const filePath = photoService.resolvePhotoPath(photo.file_path);
      res.type(photo.mime_type || 'image/jpeg');
      res.sendFile(filePath);
    } catch (err) {
      console.error('[api/photo] Error:', err.message);
      res.status(404).json({ error: 'Photo not found' });
    }
  },
};

module.exports = ApiController;
