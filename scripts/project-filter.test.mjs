import assert from "node:assert/strict";
import { test } from "node:test";
import { filterProjects } from "../src/lib/project-filter.ts";

const projects = [
  { title: { en: "Industrial AGV", ja: "産業用AGV" }, summary: { en: "ROS navigation", ja: "ナビゲーション" }, technologies: ["ROS 1", "Gazebo"], category: "mobile", startDate: "2023" },
  { title: { en: "ROS 2 Simulation", ja: "移動ロボット" }, summary: { en: "Mobile robot", ja: "移動ロボットのモデル" }, technologies: ["ROS 2", "Gazebo"], category: "simulation", categories: ["mobile"], startDate: "2025" },
  { title: { en: "Rover", ja: "ローバー" }, summary: { en: "Competition", ja: "大会" }, technologies: [], category: "competition" }
];

test("search normalizes ROS spellings, Japanese input and secondary categories", () => {
  assert.deepEqual(filterProjects(projects, "ja", "ＲＯＳ２ 移動ロボット", "mobile", "Gazebo", "relevance"), [projects[1]]);
  assert.deepEqual(filterProjects(projects, "en", "ROS 2", "competition", "", "relevance"), []);
});

test("date sort keeps undated records last", () => {
  assert.deepEqual(filterProjects(projects, "en", "", "", "", "date"), [projects[1], projects[0], projects[2]]);
});
