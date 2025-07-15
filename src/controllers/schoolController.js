const express = require("express");
const School = require("../models/School"); // Adjust path as needed


// Create school
const createSchool = async (req, res) => {
  try {
    const school = await School.create(req.body);
    res.status(201).json(school);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all schools
const getAllSchools = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const schools = await School.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await School.countDocuments();
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      schools,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: total,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get school by ID
const getSchoolById = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    res.status(200).json(school);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update school
const updateSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    res.status(200).json(school);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete school
const deleteSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndDelete(req.params.id);

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    res.status(200).json({ message: "School deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
};
