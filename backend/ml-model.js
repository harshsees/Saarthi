/**
 * ML Model for Donor Matching
 * 
 * Scores donors based on 5 weighted criteria:
 * 1. Distance from requester (within 5km radius) - 30% weight
 * 2. Total number of donations - 20% weight
 * 3. Availability for donation - 20% weight (binary filter + bonus)
 * 4. Response rate - 15% weight
 * 5. Impact score - 15% weight
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalize a value to 0-1 range using min-max normalization
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum value in dataset
 * @param {number} max - Maximum value in dataset
 * @returns {number} Normalized value between 0 and 1
 */
function normalize(value, min, max) {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

/**
 * Feature weights for scoring
 */
const WEIGHTS = {
  distance: 0.30,      // 30% - Proximity is most important
  donations: 0.20,     // 20% - Experience matters
  availability: 0.20,  // 20% - Must be available
  responseRate: 0.15,  // 15% - Reliability indicator
  impactScore: 0.15    // 15% - Overall contribution
};

const MAX_DISTANCE_KM = 5; // Maximum radius in km

/**
 * Train the model by computing statistics from donor dataset
 * @param {Array} donors - Array of donor objects
 * @returns {Object} Model containing statistics for normalization
 */
function trainKNN(donors) {
  // Compute min/max for normalization
  const donations = donors.map(d => d.total_donations || 0);
  const responseRates = donors.map(d => d.response_rate || 0);
  const impactScores = donors.map(d => d.impact_score || 0);
  
  return {
    donations: {
      min: Math.min(...donations),
      max: Math.max(...donations)
    },
    responseRate: {
      min: Math.min(...responseRates),
      max: Math.max(...responseRates)
    },
    impactScore: {
      min: Math.min(...impactScores),
      max: Math.max(...impactScores)
    },
    donorCount: donors.length
  };
}

/**
 * Find the best 5 donors based on weighted scoring
 * @param {Object} model - Trained model with normalization stats
 * @param {Object} request - Blood request with location
 * @param {Array} donors - Array of available donors
 * @returns {Array} Top 5 donor user_ids sorted by score
 */
function findBestDonors(model, request, donors) {
  const reqLat = request.latitude;
  const reqLon = request.longitude;
  
  // Score each donor
  const scoredDonors = donors.map(donor => {
    const donorLat = donor.latitude;
    const donorLon = donor.longitude;
    
    // 1. Distance Score (inverted - closer is better)
    const distance = calculateDistance(reqLat, reqLon, donorLat, donorLon);
    
    // Filter out donors beyond 5km radius (unless no location data)
    const withinRadius = distance <= MAX_DISTANCE_KM || distance === Infinity;
    
    // Distance score: 1.0 for 0km, 0.0 for 5km+
    let distanceScore = 0;
    if (distance !== Infinity && distance <= MAX_DISTANCE_KM) {
      distanceScore = 1 - (distance / MAX_DISTANCE_KM);
    } else if (distance === Infinity) {
      // No location data - give neutral score
      distanceScore = 0.5;
    }
    
    // 2. Donations Score (normalized)
    const donationsScore = normalize(
      donor.total_donations || 0,
      model.donations.min,
      model.donations.max
    );
    
    // 3. Availability Score (binary with bonus for being available)
    const availabilityScore = donor.available_for_donation ? 1.0 : 0.0;
    
    // 4. Response Rate Score (normalized, already 0-100)
    const responseRateScore = normalize(
      donor.response_rate || 0,
      model.responseRate.min,
      model.responseRate.max
    );
    
    // 5. Impact Score (normalized)
    const impactScoreValue = normalize(
      donor.impact_score || 0,
      model.impactScore.min,
      model.impactScore.max
    );
    
    // Calculate weighted total score
    const totalScore = 
      (distanceScore * WEIGHTS.distance) +
      (donationsScore * WEIGHTS.donations) +
      (availabilityScore * WEIGHTS.availability) +
      (responseRateScore * WEIGHTS.responseRate) +
      (impactScoreValue * WEIGHTS.impactScore);
    
    return {
      user_id: donor.user_id,
      score: totalScore,
      distance: distance,
      withinRadius: withinRadius,
      available: donor.available_for_donation,
      breakdown: {
        distance: distanceScore,
        donations: donationsScore,
        availability: availabilityScore,
        responseRate: responseRateScore,
        impactScore: impactScoreValue
      }
    };
  });
  
  // Filter: must be available AND (within 5km OR no location data available)
  const eligibleDonors = scoredDonors.filter(d => 
    d.available && d.withinRadius
  );
  
  // If no donors within radius, fall back to all available donors
  const candidateDonors = eligibleDonors.length > 0 
    ? eligibleDonors 
    : scoredDonors.filter(d => d.available);
  
  // Sort by score descending and take top 5
  const topDonors = candidateDonors
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  // Log for debugging
  console.log("🧠 ML Model - Top Donor Scores:");
  topDonors.forEach((d, i) => {
    console.log(`  ${i + 1}. User ${d.user_id}: Score ${d.score.toFixed(3)} | Distance: ${d.distance === Infinity ? 'N/A' : d.distance.toFixed(2) + 'km'}`);
  });
  
  // Return array of user_ids
  return topDonors.map(d => d.user_id);
}

module.exports = { trainKNN, findBestDonors, calculateDistance, WEIGHTS, MAX_DISTANCE_KM };