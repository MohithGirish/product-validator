import { ProductData, User } from './types';

export const MOCK_USERS: User[] = [
  { id: 'user-000', username: 'admin', password: 'admin', role: 'admin' },
  { id: 'user-001', username: 'qcmanager', password: 'qcmanager', role: 'staff' },
  { id: 'user-002', username: 'scmanager', password: 'scmanager', role: 'staff' },
  { id: 'user-003', username: 'line_supervisor', password: 'password456', role: 'staff' },
];

export const MASTER_PRODUCT_DATABASE: ProductData[] = [
  {
    id: 'prod-8909081011368-general',
    productName: 'Right Shift Jaggery Oats Cookies',
    barcode: '8909081011368',
    marketType: 'general',
    batchNumberFormat: '##:## ##@##',
    mrpApplicable: true,
    mrp: 90,
    shelfLife: 179,
    shelfLifeUnit: 'days',
    batchInfoText: `Batch No.: 16:47 01B11
PKD.: 27/09/25
Use By.: 25/03/26
MRP Rs. 90.00/(0.75)
incl. of all taxes/(Rs. per g)`
  },
  {
    id: 'prod-8909081003363-general',
    productName: 'Shines',
    barcode: '8909081003363',
    marketType: 'general',
    batchNumberFormat: '##:## ##@##',
    mrpApplicable: true,
    mrp: 9,
    shelfLife: 179,
    shelfLifeUnit: 'days',
    batchInfoText: `GST 2.0 MRP Rs.9.00
Rs.0.20 per g
11:05 04A11
25/10/25
22/04/26`
  },
  {
    id: 'prod-8901725103545-general',
    productName: 'Fabelle Hazelnut Mousse',
    barcode: '8901725103545',
    marketType: 'general',
    batchNumberFormat: '@@@######@',
    mrpApplicable: true,
    mrp: 440,
    shelfLife: 364,
    shelfLifeUnit: 'days',
    batchInfoText: `MRP ₹ 440.00 (Rs.3.46/g)
incl. of all taxes
PKD.: 24/10/25
USE BY: 23/10/26
BATCH NO.: BHB241025H
NET WEIGHT: 127g`
  }
];