#!/bin/bash
# Extract methods from NexquareService.ts
FILE="NexquareService.ts"

# Method line ranges (from Python script output)
declare -A METHODS=(
  ["authenticate"]="256-266"
  ["getSchools"]="271-339"
  ["verifySchoolAccess"]="344-368"
  ["getStudents"]="419-620"
  ["getStaff"]="621-754"
  ["getClasses"]="755-869"
  ["getAllocationMaster"]="870-970"
  ["getStudentAllocations"]="975-1394"
  ["getStaffAllocations"]="1399-1609"
  ["getDailyPlans"]="1776-1947"
  ["getDailyAttendance"]="1948-2327"
  ["getLessonAttendance"]="2328-2586"
  ["getStudentAssessments"]="2587-2996"
)

echo "Methods to extract: ${!METHODS[@]}"
