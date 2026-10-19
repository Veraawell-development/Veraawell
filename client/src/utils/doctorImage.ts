/**
 * A doctor's photo, or a default picked from the first name (the backend has
 * no gender field). Shared by the directory and the landing page.
 */
export const getDoctorImage = (doctor: any): string => {
  // Check if doctor has a valid profile image (not default/placeholder/old SVG)
  if (doctor.profileImage &&
    doctor.profileImage !== '/default-doctor.png' &&
    !doctor.profileImage.includes('doctor-0') &&
    !doctor.profileImage.includes('doctor-placeholder')) {
    return doctor.profileImage;
  }

  // Use name-based detection since backend doesn't have gender field
  const firstName = (doctor.userId?.firstName || doctor.firstName || '').toLowerCase();

  // Common female names and patterns
  const femaleNames = [
    'shreya', 'priya', 'anjali', 'kavya', 'divya', 'neha', 'pooja', 'riya',
    'sneha', 'swati', 'nikita', 'preeti', 'shweta', 'megha', 'isha', 'tanvi',
    'aditi', 'aishwarya', 'ananya', 'deepika', 'kriti', 'nisha', 'rachana',
    'sakshi', 'simran', 'sonali', 'tanya', 'varsha', 'vidya', 'zoya',
    'sarah', 'emily', 'jessica', 'jennifer', 'michelle', 'amanda', 'lisa',
    'maria', 'susan', 'karen', 'nancy', 'betty', 'helen', 'sandra', 'donna',
    'carol', 'ruth', 'sharon', 'laura', 'cynthia', 'anna', 'jean', 'alice'
  ];

  // Check if name ends with common female suffixes
  const femaleSuffixes = ['a', 'i', 'ya', 'ka', 'na'];
  const endsWithFemaleSuffix = femaleSuffixes.some(suffix =>
    firstName.endsWith(suffix) && firstName.length > 3
  );

  // Check if name is in female names list or ends with female suffix
  if (femaleNames.includes(firstName) || endsWithFemaleSuffix) {
    return '/female.jpg';
  }

  return '/male.jpg';
};
