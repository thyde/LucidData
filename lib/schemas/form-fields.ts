export interface FormField {
  name: string
  label: string
  type: 'text' | 'date' | 'select' | 'multi-text' | 'checkbox' | 'number'
  options?: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}

export const SCHEMA_FORM_FIELDS: Record<string, FormField[]> = {
  medical_basic: [
    { name: 'full_name', label: 'Full name', type: 'text', required: true },
    { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
    { name: 'blood_type', label: 'Blood type', type: 'select', required: true, options: [
      { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
      { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
      { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
      { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
      { value: 'Unknown', label: 'Unknown' },
    ]},
    { name: 'allergies', label: 'Allergies (one per line)', type: 'multi-text' },
    { name: 'conditions', label: 'Medical conditions (one per line)', type: 'multi-text' },
    { name: 'medications', label: 'Current medications (one per line)', type: 'multi-text' },
    { name: 'emergency_contact', label: 'Emergency contact', type: 'text' },
  ],
  financial_summary: [
    { name: 'bank_name', label: 'Bank name', type: 'text' },
    { name: 'account_type', label: 'Account type', type: 'select', options: [
      { value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' },
      { value: 'investment', label: 'Investment' }, { value: 'other', label: 'Other' },
    ]},
    { name: 'income_range', label: 'Income range', type: 'select', options: [
      { value: '<25k', label: 'Under $25k' }, { value: '25k-50k', label: '$25k–$50k' },
      { value: '50k-100k', label: '$50k–$100k' }, { value: '100k-200k', label: '$100k–$200k' },
      { value: '>200k', label: 'Over $200k' },
    ]},
    { name: 'credit_score_band', label: 'Credit score band', type: 'select', options: [
      { value: 'poor', label: 'Poor (300–579)' }, { value: 'fair', label: 'Fair (580–669)' },
      { value: 'good', label: 'Good (670–739)' }, { value: 'very_good', label: 'Very Good (740–799)' },
      { value: 'exceptional', label: 'Exceptional (800+)' },
    ]},
    { name: 'notes', label: 'Notes', type: 'text' },
  ],
  identity: [
    { name: 'full_name', label: 'Full name', type: 'text', required: true },
    { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
    { name: 'nationality', label: 'Nationality', type: 'text', required: true },
    { name: 'id_type', label: 'Document type', type: 'select', required: true, options: [
      { value: 'passport', label: 'Passport' }, { value: 'drivers_license', label: "Driver's License" },
      { value: 'national_id', label: 'National ID' }, { value: 'other', label: 'Other' },
    ]},
    { name: 'id_number_last4', label: 'Last 4 digits of ID number', type: 'text', placeholder: '1234' },
    { name: 'issuing_country', label: 'Issuing country', type: 'text' },
    { name: 'expiry_date', label: 'Expiry date', type: 'date' },
  ],
  employment: [
    { name: 'employer', label: 'Employer', type: 'text', required: true },
    { name: 'role', label: 'Role / Title', type: 'text', required: true },
    { name: 'employment_type', label: 'Employment type', type: 'select', required: true, options: [
      { value: 'full_time', label: 'Full-time' }, { value: 'part_time', label: 'Part-time' },
      { value: 'contract', label: 'Contract' }, { value: 'freelance', label: 'Freelance' },
      { value: 'other', label: 'Other' },
    ]},
    { name: 'start_date', label: 'Start date', type: 'date', required: true },
    { name: 'end_date', label: 'End date', type: 'date' },
    { name: 'is_current', label: 'Currently employed here', type: 'checkbox' },
    { name: 'salary_range', label: 'Salary range', type: 'select', options: [
      { value: '<30k', label: 'Under $30k' }, { value: '30k-60k', label: '$30k–$60k' },
      { value: '60k-100k', label: '$60k–$100k' }, { value: '100k-150k', label: '$100k–$150k' },
      { value: '>150k', label: 'Over $150k' },
    ]},
  ],
  education: [
    { name: 'institution', label: 'Institution', type: 'text', required: true },
    { name: 'degree', label: 'Degree', type: 'select', required: true, options: [
      { value: 'high_school', label: 'High School' }, { value: 'associate', label: 'Associate' },
      { value: 'bachelor', label: "Bachelor's" }, { value: 'master', label: "Master's" },
      { value: 'doctorate', label: 'Doctorate' }, { value: 'certificate', label: 'Certificate' },
      { value: 'other', label: 'Other' },
    ]},
    { name: 'field_of_study', label: 'Field of study', type: 'text', required: true },
    { name: 'graduation_year', label: 'Graduation year', type: 'number', placeholder: '2024' },
    { name: 'gpa', label: 'GPA (optional)', type: 'text' },
    { name: 'honors', label: 'Honors / Awards', type: 'text' },
  ],
}
