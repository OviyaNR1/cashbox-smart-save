export const PROVINCES = [
  "Kerala", "Tamil Nadu",
  "Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba",
  "Saskatchewan", "Nova Scotia", "New Brunswick", "Newfoundland and Labrador",
  "Prince Edward Island", "Northwest Territories", "Yukon", "Nunavut",
];

export const ID_TYPES = [
  { value: "driver_license", label: "Driver's Licence" },
  { value: "provincial_photo_id", label: "Provincial Photo ID" },
  { value: "pr_card", label: "Permanent Resident Card" },
  { value: "canadian_passport", label: "Canadian Passport" },
  { value: "citizenship_certificate", label: "Citizenship Certificate" },
  { value: "work_permit", label: "Work Permit" },
  { value: "study_permit", label: "Study Permit" },
  { value: "other", label: "Other" },
];

export const ADDRESS_DOC_TYPES = [
  { value: "utility_bill", label: "Utility Bill" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "government_letter", label: "Government Letter" },
  { value: "rental_agreement", label: "Rental Agreement" },
];

export const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "tamil", label: "Tamil" },
  { value: "sinhala", label: "Sinhala" },
  { value: "urdu", label: "Urdu" },
  { value: "bengali", label: "Bengali" },
  { value: "nepali", label: "Nepali" },
  { value: "filipino", label: "Filipino" },
  { value: "french", label: "French" },
  { value: "other", label: "Other" },
];

export const INCOME_RANGES = [
  { value: "under_30k", label: "Under $30,000" },
  { value: "30k_50k", label: "$30,000 – $50,000" },
  { value: "50k_75k", label: "$50,000 – $75,000" },
  { value: "75k_100k", label: "$75,000 – $100,000" },
  { value: "100k_plus", label: "$100,000+" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const EMPLOYMENT_STATUSES = [
  { value: "employed", label: "Employed" },
  { value: "self_employed", label: "Self-Employed" },
  { value: "unemployed", label: "Unemployed" },
  { value: "retired", label: "Retired" },
  { value: "student", label: "Student" },
  { value: "other", label: "Other" },
];

export const KYC_STAGES = [
  { value: "registration", label: "Registration" },
  { value: "document_upload", label: "Document Upload" },
  { value: "identity_verification", label: "Identity Verification" },
  { value: "guarantor_verification", label: "Guarantor Verification" },
  { value: "admin_review", label: "Admin Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const KYC_STAGE_ORDER = [
  "registration", "document_upload", "identity_verification",
  "guarantor_verification", "admin_review", "approved",
];

export const WINNER_METHODS = [
  { value: "admin_selection", label: "Admin Selection" },
  { value: "recorded_random_draw", label: "Recorded Random Draw" },
  { value: "manual_selection", label: "Approved Manual Selection" },
  { value: "live_auction_placeholder", label: "Live Auction (Coming Soon)" },
];

export const DOC_TYPE_LABELS = {
  aadhaar_card: "Aadhaar Card",
  driver_license: "Driver's Licence",
  provincial_photo_id: "Provincial Photo ID",
  pr_card: "Permanent Resident Card",
  canadian_passport: "Canadian Passport",
  citizenship_certificate: "Citizenship Certificate",
  work_permit: "Work Permit",
  study_permit: "Study Permit",
  utility_bill: "Utility Bill",
  bank_statement: "Bank Statement",
  government_letter: "Government Letter",
  rental_agreement: "Rental Agreement",
  employment_doc: "Employment Document",
  bank_doc: "Bank Document",
  guarantor_id: "Guarantor ID",
  selfie: "Selfie Verification",
};