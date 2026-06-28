/**
 * Dashboard controller — read-only views of captured leads (tenant-scoped).
 */
const config = require('../../config/env');
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');

const DashboardController = {
  index(req, res) {
    const accountId = req.query.account_id || config.defaultAccountId;
    const { leads } = forAccount(accountId);

    res.render('dashboard/index', {
      title: 'Leads Dashboard',
      leads: leads.findAll(),
      accountId,
      statuses: LeadRepository.STATUSES,
    });
  },

  show(req, res) {
    const accountId = req.query.account_id || config.defaultAccountId;
    const { leads, messages } = forAccount(accountId);

    const lead = leads.findById(req.params.id);
    if (!lead) {
      return res.status(404).render('dashboard/404', { title: 'Not Found' });
    }

    res.render('dashboard/show', {
      title: `Lead #${lead.id}`,
      lead,
      messages: messages.findByLead(lead.id),
      statuses: LeadRepository.STATUSES,
    });
  },
};

module.exports = DashboardController;
