const express = require("express");
const Category = require("../models/Category"); // Adjust path as needed

const router = express.Router();

// Create category
const createCategory = async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({category, message: "Category added successfully"});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const categories = await Category.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Category.countDocuments();
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      categories,
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

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.status(200).json({category, message: "Category updated"});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete category
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
