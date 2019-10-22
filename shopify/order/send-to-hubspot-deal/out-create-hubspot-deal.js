const Mesa = require('vendor/Mesa.js');
const Hubspot = require('vendor/Hubspot.js');
const Mapping = require('vendor/Mapping.js');
const ShopifyHubSpotOrderDealMap = require('./shopify-hubspot-order-deal-map.js');
// const ShopifyHubSpotCustomerDealMap = require('./shopify-hubspot-customer-deal-map.js');

module.exports = new (class {
  script = payload => {
    const hubspot = new Hubspot(Mesa.secret.get('hubspot.hapi'));

    // Check if hubspot contact exists, pass ID to out-create-hubspot-deal if available
    const contactResponse = hubspot.getContactByEmail(payload.email);

    Mesa.log.debug('HubSpot.getContactByEmail response', contactResponse);

    if (contactResponse.error || contactResponse.status === 'error') {
      if (
        !contactResponse.category ||
        contactResponse.category !== 'OBJECT_NOT_FOUND'
      ) {
        hubspot.logError(contactResponse, 'finding', 'Contact');
        return;
      } else if (
        Mesa.storage.get('hubspot_create_deal_without_contact') === 'true'
      ) {
        Mesa.log.info(
          `No contact found for email ${payload.email}, hubspot_create_deal_without_contact is true, will create deal without contact`
        );
      } else {
        Mesa.log.error(
          `No contact found for email ${payload.email}, hubspot_create_deal_without_contact is not true, will not create deal`
        );
        return;
      }
    }

    // Include additional data
    const additionalData = {
      dealname: `Shopify order ${payload.name}`,
      dealtype: Mesa.storage.get('hubspot_deal_deal_type'),
      pipeline: Mesa.storage.get('hubspot_deal_pipeline'),
      dealstage: Mesa.storage.get('hubspot_deal_deal_stage')
    };

    payload = { ...payload, ...additionalData };

    const processors = {
      preProcess: [],
      process: [hubspot.convertShopifyDateToTimestamp],
      postProcess: [this.structureOutgoingHubSpotDataWithNameProperty]
    };

    // Map Shopify order data to HubSpot data
    const dealPostData = Mapping.convert(
      ShopifyHubSpotOrderDealMap,
      payload,
      'shopify',
      'hubspot',
      processors
    );

    // Add contact ID if available
    if (contactResponse.vid) {
      dealPostData.associations = {
        associatedVids: [contactResponse.vid]
      };
    }

    // Now create the deal
    const dealResponse = hubspot.createDeal(dealPostData);

    // Optional logging
    if (dealResponse.error) {
      hubspot.logError(dealResponse, 'creating', 'deal');
    } else {
      Mesa.log.info(
        'HubSpot deal created successfully with ID',
        dealResponse.dealId
      );
    }
  };

  /**
   * Wraps Hubspot.structureOutgoingHubSpotData() method by passing 'name' as the property value
   *
   * @param payload
   * @return
   */
  structureOutgoingHubSpotDataWithNameProperty = payload => {
    const hubspot = new Hubspot(Mesa.secret.get('hubspot.hapi'));
    return hubspot.structureOutgoingHubSpotData(payload, 'name');
  };
})();
