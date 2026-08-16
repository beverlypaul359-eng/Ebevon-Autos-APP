const axios    = require('axios');
const config   = require('../config');
const AppError = require('../utils/AppError');
const logger   = require('../utils/logger');

/* ══════════════════════════════════════════════
   NHTSA FREE API — primary source
   https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json
══════════════════════════════════════════════ */
const decodeViaNHTSA = async (vin) => {
  const url = `${config.nhtsa.apiUrl}/DecodeVinValues/${vin}?format=json`;
  const resp = await axios.get(url, { timeout: 8000 });
  const result = resp.data?.Results?.[0];
  if (!result) throw new AppError('Unable to decode VIN from NHTSA', 502);
  return result;
};

/* ══════════════════════════════════════════════
   MAIN — verifyVin
   Returns { valid, match, vin, data, errors }
══════════════════════════════════════════════ */
const verifyVin = async ({ vin, brand, model, year }) => {
  if (!vin || vin.length !== 17)
    throw new AppError('VIN must be exactly 17 characters', 400, 'INVALID_VIN');

  // Basic VIN format check (no I, O, Q)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))
    throw new AppError('VIN contains invalid characters', 400, 'INVALID_VIN_FORMAT');

  let nhtsaData;
  try {
    nhtsaData = await decodeViaNHTSA(vin);
  } catch (err) {
    logger.error(`NHTSA VIN lookup failed: ${err.message}`);
    throw new AppError('Vehicle database lookup failed. Please try again.', 502, 'VIN_LOOKUP_FAILED');
  }

  const errors     = [];
  const apiErrorCode = nhtsaData.ErrorCode || '';

  // NHTSA returns "0" for success
  if (apiErrorCode !== '0' && apiErrorCode !== '') {
    return {
      valid: false,
      match: false,
      vin,
      data:   nhtsaData,
      errors: [`VIN not found in vehicle database: ${nhtsaData.ErrorText || 'Unknown error'}`],
    };
  }

  // ── Cross-reference user-supplied data ──
  const apiMake  = (nhtsaData.Make  || '').toLowerCase();
  const apiModel = (nhtsaData.Model || '').toLowerCase();
  const apiYear  = parseInt(nhtsaData.ModelYear, 10);

  const userBrand = (brand  || '').toLowerCase();
  const userModel = (model  || '').toLowerCase();
  const userYear  = parseInt(year,  10);

  // Brand check (fuzzy: Mercedes-Benz vs MERCEDES-BENZ etc.)
  if (userBrand && !apiMake.includes(userBrand.split('-')[0]) && !userBrand.includes(apiMake.split(' ')[0])) {
    errors.push(`Brand mismatch: VIN shows ${nhtsaData.Make}, you entered ${brand}`);
  }

  // Model check (partial is fine)
  if (userModel && !apiModel.includes(userModel.split(' ')[0]) && !userModel.includes(apiModel.split(' ')[0])) {
    errors.push(`Model mismatch: VIN shows ${nhtsaData.Model}, you entered ${model}`);
  }

  // Year check (allow ±1 for model year variants)
  if (userYear && apiYear && Math.abs(userYear - apiYear) > 1) {
    errors.push(`Year mismatch: VIN shows ${nhtsaData.ModelYear}, you entered ${year}`);
  }

  const cleanData = {
    vin,
    make:              nhtsaData.Make,
    model:             nhtsaData.Model,
    modelYear:         nhtsaData.ModelYear,
    bodyClass:         nhtsaData.BodyClass,
    driveType:         nhtsaData.DriveType,
    engineCylinders:   nhtsaData.EngineCylinders,
    engineDisplacementL: nhtsaData.DisplacementL,
    fuelTypePrimary:   nhtsaData.FuelTypePrimary,
    transmissionStyle: nhtsaData.TransmissionStyle,
    plantCountry:      nhtsaData.PlantCountry,
    vehicleType:       nhtsaData.VehicleType,
    manufacturerName:  nhtsaData.Manufacturer,
    trim:              nhtsaData.Trim,
    series:            nhtsaData.Series,
    doors:             nhtsaData.Doors,
    seats:             nhtsaData.Seats,
  };

  return {
    valid:  true,
    match:  errors.length === 0,
    vin,
    data:   cleanData,
    errors,
  };
};

module.exports = { verifyVin };
