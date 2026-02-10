#!/bin/bash

# ManageBac API Integration Test Script
# Usage: ./test-api.sh [API_KEY]

API_KEY="${1:-${MANAGEBAC_API_KEY}}"
BASE_URL="http://localhost:3001"

if [ -z "$API_KEY" ]; then
  echo "❌ API key required. Usage: ./test-api.sh YOUR_API_KEY"
  echo "   Or set MANAGEBAC_API_KEY environment variable"
  exit 1
fi

echo "🧪 Testing ManageBac API Integration"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  
  echo -n "Testing $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -X GET \
      -H "auth-token: $API_KEY" \
      -H "Content-Type: application/json" \
      "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "auth-token: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$BASE_URL$endpoint")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}✅ Success (HTTP $http_code)${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body" | head -c 200
    echo ""
    return 0
  else
    echo -e "${RED}❌ Failed (HTTP $http_code)${NC}"
    echo "$body" | head -c 200
    echo ""
    return 1
  fi
}

# Test 1: Health Check
echo "1. Health Check"
test_endpoint "Health Check" "GET" "/api/health"
echo ""

# Test 2: Authentication
echo "2. Authentication"
test_endpoint "Authenticate" "POST" "/api/managebac/authenticate" "{\"apiKey\":\"$API_KEY\"}"
echo ""

# Test 3: Get School
echo "3. Get School Details"
test_endpoint "Get School" "GET" "/api/managebac/school"
echo ""

# Test 4: Get Academic Years
echo "4. Get Academic Years"
test_endpoint "Get Academic Years" "GET" "/api/managebac/academic-years?program_code=IB"
echo ""

# Test 5: Get Grades
echo "5. Get Grades"
test_endpoint "Get Grades" "GET" "/api/managebac/grades"
echo ""

# Test 6: Get Subjects
echo "6. Get Subjects"
test_endpoint "Get Subjects" "GET" "/api/managebac/subjects"
echo ""

# Test 7: Get Teachers
echo "7. Get Teachers"
test_endpoint "Get Teachers" "GET" "/api/managebac/teachers?active_only=true"
echo ""

# Test 8: Get Students
echo "8. Get Students"
test_endpoint "Get Students" "GET" "/api/managebac/students?active_only=true"
echo ""

# Test 9: Get Classes
echo "9. Get Classes"
test_endpoint "Get Classes" "GET" "/api/managebac/classes"
echo ""

# Test 10: Get Year Groups
echo "10. Get Year Groups"
test_endpoint "Get Year Groups" "GET" "/api/managebac/year-groups"
echo ""

# Test 11: Analytics - Metrics
echo "11. Analytics - Student Metrics"
test_endpoint "Get Metrics" "GET" "/api/analytics/metrics"
echo ""

# Test 12: Analytics - Subject Performance
echo "12. Analytics - Subject Performance"
test_endpoint "Get Subject Performance" "GET" "/api/analytics/subject-performance"
echo ""

echo "===================================="
echo "✅ Testing completed!"
echo ""
echo "💡 Check the responses above to verify:"
echo "   - ManageBac API calls are working"
echo "   - Data is being saved to Azure SQL"
echo "   - Analytics endpoints are returning data"

