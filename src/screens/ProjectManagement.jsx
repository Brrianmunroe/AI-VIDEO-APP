import React, { useState, useEffect } from 'react';
import CreateProjectModal from '../components/CreateProjectModal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import './styles/ProjectManagement.css';

function ProjectManagement({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    if (!window.electronAPI) {
      setLoading(false);
      return;
    }

    try {
      const result = await window.electronAPI.projects.getAll();
      setProjects(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (name, location) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.projects.create(name, location);
      if (result.success) {
        await loadProjects();
        setIsModalOpen(false);
        // Optionally open the new project
        if (onOpenProject) {
          onOpenProject(result.data);
        }
      } else {
        alert(`Failed to create project: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert(`Failed to create project: ${error.message}`);
    }
  };

  const handleProjectClick = (project) => {
    if (onOpenProject) {
      onOpenProject(project);
    }
  };

  const handleProjectDelete = async (projectId, event) => {
    event.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this project?')) {
      return;
    }

    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.projects.delete(projectId);
      if (result.success) {
        await loadProjects();
      } else {
        alert(`Failed to delete project: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert(`Failed to delete project: ${error.message}`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="project-management">
      <div className="project-management-header">
        <div className="action-cards">
          <div
            className="action-card create-project"
            role="button"
            tabIndex={0}
            aria-label="Create new project"
            onClick={() => setIsModalOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsModalOpen(true);
              }
            }}
          >
            <div className="action-card-content">
              <div className="card-icon" aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.0343 18.7589L10.6009 19.7384C10.2838 20.4554 9.277 20.4554 8.95984 19.7384L8.52649 18.7589C7.75402 17.0125 6.36268 15.622 4.62655 14.8613L3.29143 14.2763C2.56952 13.96 2.56952 12.9251 3.29143 12.6087L4.5519 12.0564C6.33267 11.2762 7.74894 9.83422 8.50814 8.02846L8.95316 6.97001C9.26331 6.23233 10.2975 6.23233 10.6076 6.97001L11.0526 8.02846C11.8118 9.83422 13.2281 11.2762 15.009 12.0564L16.2693 12.6087C16.9914 12.9251 16.9914 13.96 16.2693 14.2763L14.9342 14.8613C13.1981 15.622 11.8067 17.0125 11.0343 18.7589ZM20.3261 13.3427C20.3261 19.0803 15.6046 23.7316 9.78043 23.7316C7.85961 23.7316 6.05873 23.2256 4.50761 22.3417V35.8519C4.50761 36.8082 5.29452 37.5834 6.26522 37.5834H30.8717C31.8425 37.5834 32.6293 36.8082 32.6293 35.8519V28.5797L39.8673 34.8984C40.0149 35.0002 40.1909 35.0549 40.3712 35.0549C40.8565 35.0549 41.25 34.6673 41.25 34.1892V13.274C41.25 13.0964 41.1945 12.923 41.0911 12.7775C40.8129 12.3858 40.2649 12.2905 39.8673 12.5647L32.6293 18.8834V11.6112C32.6293 10.6549 31.8425 9.87971 30.8717 9.87971H19.726C20.1146 10.9629 20.3261 12.1284 20.3261 13.3427Z" fill="currentColor" />
                </svg>
              </div>
              <h3 className="card-title">Create New Project</h3>
              <p className="card-subtitle">Quickly cut interview selects.</p>
            </div>
          </div>
          
          <div className="action-card upload-footage disabled">
            <div className="action-card-content">
              <div className="card-icon">
                <Icon type="upload" size="lg" state="disabled" />
              </div>
              <h3 className="card-title">Upload Footage</h3>
              <p className="card-subtitle">Semantic search your footage.</p>
            </div>
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
        </div>
      </div>

      <div className="recent-projects-section">
        <h2 className="section-title">Recent Projects</h2>
        {loading ? (
          <div className="loading-state">Loading projects...</div>
        ) : !Array.isArray(projects) || projects.length === 0 ? (
          <div className="empty-state">No projects yet. Create your first project to get started!</div>
        ) : (
          <div className="projects-table-wrapper">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Last Accessed</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="project-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open project ${project.name}`}
                  onClick={() => handleProjectClick(project)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProjectClick(project);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Right-click menu could be added here
                  }}
                >
                  <td className="project-name-cell">
                    <div className="project-name-cell-inner">
                      <Icon type="footage" size="sm" state="primary" />
                      {project.name}
                    </div>
                  </td>
                  <td>{formatDate(project.updatedAt)}</td>
                  <td>{new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="project-actions">
                    <button
                      className="delete-btn"
                      onClick={(e) => handleProjectDelete(project.id, e)}
                      title="Delete project"
                    >
                      <Icon type="close" size="sm" state="primary" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default ProjectManagement;
