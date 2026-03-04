import { User } from './auth';

export interface Student extends User {
  admission_number: string;
  roll_number?: number;
  grade?: string;
  section?: string;
  admission_date?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  whatsapp_number?: string;
  emergency_contact?: string;
  status: string;
  exit_date?: string;
  graduation_date?: string;
  withdrawal_reason?: string;
  photo?: string;
  phone_number?: string;
  grade_id?: string;
  section_id?: string;
}


export interface StudentCreateResponse extends Student {
  generated_password?: string;
  generated_admission_number?: string;
}
export interface StudentCreate {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  admission_number?: string;
  roll_number?: number;
  grade?: string;
  section?: string;
  admission_date?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  whatsapp_number?: string;
  emergency_contact?: string;
  photo?: string;
  phone_number?: string;
}

export interface StudentUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  admission_number?: string;
  roll_number?: number;
  grade?: string;
  section?: string;
  admission_date?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  whatsapp_number?: string;
  emergency_contact?: string;
  photo?: string;
  phone_number?: string;
  status?: string;
  grade_id?: string;
  section_id?: string;
  academic_year?: string;
}
