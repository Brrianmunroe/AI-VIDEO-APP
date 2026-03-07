import React, { useState, useEffect, useRef } from 'react';
import CreateProjectModal from '../components/CreateProjectModal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import './styles/ProjectManagement.css';

function ProjectManagement({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flareOpacity, setFlareOpacity] = useState({ tl: 0, br: 0 });
  const [flareStreakScale, setFlareStreakScale] = useState({ tl: 0.65, br: 0.65 });
  const [flareCursor, setFlareCursor] = useState({ x: 0, y: 0 });
  const cardIconRef = useRef(null);

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

  const handleFlareMouseMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();

    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    let iconCenterX = rect.width / 2;
    let iconCenterY = rect.height / 2;
    if (cardIconRef.current) {
      const iconRect = cardIconRef.current.getBoundingClientRect();
      iconCenterX = iconRect.left - rect.left + iconRect.width / 2;
      iconCenterY = iconRect.top - rect.top + iconRect.height / 2;
    }

    const distToIcon = Math.sqrt((cursorX - iconCenterX) ** 2 + (cursorY - iconCenterY) ** 2);
    const maxDist = Math.sqrt(rect.width ** 2 + rect.height ** 2);
    const distNorm = Math.max(0, 1 - distToIcon / maxDist);

    const nx = Math.max(-0.2, Math.min(0.2, (cursorX / rect.width - 0.5) * 2));
    const ny = Math.max(-0.2, Math.min(0.2, (cursorY / rect.height - 0.5) * 2));

    const opacityTL = 0.1 + 0.65 * distNorm;
    const opacityBR = 0.1 + 0.65 * distNorm;
    const streakScaleTL = 0.65 + 0.7 * distNorm;
    const streakScaleBR = 0.65 + 0.7 * distNorm;

    setFlareOpacity({ tl: opacityTL, br: opacityBR });
    setFlareStreakScale({ tl: streakScaleTL, br: streakScaleBR });
    setFlareCursor({ x: nx, y: ny });
  };

  const handleFlareMouseEnter = (e) => {
    handleFlareMouseMove(e);
  };

  const handleFlareMouseLeave = () => {
    setFlareOpacity({ tl: 0, br: 0 });
    setFlareStreakScale({ tl: 0.65, br: 0.65 });
    setFlareCursor({ x: 0, y: 0 });
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
            onClick={() => setIsModalOpen(true)}
            onMouseEnter={handleFlareMouseEnter}
            onMouseMove={handleFlareMouseMove}
            onMouseLeave={handleFlareMouseLeave}
            style={{
              '--flare-opacity-tl': flareOpacity.tl,
              '--flare-opacity-br': flareOpacity.br,
              '--flare-streak-scale-tl': flareStreakScale.tl,
              '--flare-streak-scale-br': flareStreakScale.br,
              '--flare-dx': flareCursor.x,
              '--flare-dy': flareCursor.y,
            }}
          >
            <div className="action-card__lens-flare" aria-hidden="true">
              <div className="lens-flare__inner">
                <div className="lens-flare__core" />
                <div className="lens-flare__ring lens-flare__ring--primary" />
                <div className="lens-flare__streak lens-flare__streak--diffuse-top" />
                <div className="lens-flare__streak lens-flare__streak--main" />
                <div className="lens-flare__streak lens-flare__streak--diffuse-bottom" />
                <div className="lens-flare__striation lens-flare__striation--45" />
                <div className="lens-flare__striation lens-flare__striation--90" />
                <div className="lens-flare__striation lens-flare__striation--135" />
                <div className="lens-flare__striation lens-flare__striation--225" />
                <div className="lens-flare__striation lens-flare__striation--270" />
                <div className="lens-flare__striation lens-flare__striation--315" />
                <div className="lens-flare__ghost lens-flare__ghost--large" />
                <div className="lens-flare__ghost lens-flare__ghost--medium" />
                <div className="lens-flare__spot lens-flare__spot--bright" />
                <div className="lens-flare__spot lens-flare__spot--soft" />
                <div className="lens-flare__chromatic" />
              </div>
              <div className="lens-flare__inner lens-flare__inner--bottom-left">
                <div className="lens-flare__core" />
                <div className="lens-flare__ring lens-flare__ring--primary" />
                <div className="lens-flare__streak lens-flare__streak--diffuse-top" />
                <div className="lens-flare__streak lens-flare__streak--main" />
                <div className="lens-flare__streak lens-flare__streak--diffuse-bottom" />
                <div className="lens-flare__striation lens-flare__striation--45" />
                <div className="lens-flare__striation lens-flare__striation--90" />
                <div className="lens-flare__striation lens-flare__striation--135" />
                <div className="lens-flare__striation lens-flare__striation--225" />
                <div className="lens-flare__striation lens-flare__striation--270" />
                <div className="lens-flare__striation lens-flare__striation--315" />
                <div className="lens-flare__ghost lens-flare__ghost--large" />
                <div className="lens-flare__ghost lens-flare__ghost--medium" />
                <div className="lens-flare__spot lens-flare__spot--bright" />
                <div className="lens-flare__spot lens-flare__spot--soft" />
                <div className="lens-flare__chromatic" />
              </div>
            </div>
            <div className="action-card-content">
              <div ref={cardIconRef} className="card-icon" aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.0343 18.7589L10.6009 19.7384C10.2838 20.4554 9.277 20.4554 8.95984 19.7384L8.52649 18.7589C7.75402 17.0125 6.36268 15.622 4.62655 14.8613L3.29143 14.2763C2.56952 13.96 2.56952 12.9251 3.29143 12.6087L4.5519 12.0564C6.33267 11.2762 7.74894 9.83422 8.50814 8.02846L8.95316 6.97001C9.26331 6.23233 10.2975 6.23233 10.6076 6.97001L11.0526 8.02846C11.8118 9.83422 13.2281 11.2762 15.009 12.0564L16.2693 12.6087C16.9914 12.9251 16.9914 13.96 16.2693 14.2763L14.9342 14.8613C13.1981 15.622 11.8067 17.0125 11.0343 18.7589ZM20.3261 13.3427C20.3261 19.0803 15.6046 23.7316 9.78043 23.7316C7.85961 23.7316 6.05873 23.2256 4.50761 22.3417V35.8519C4.50761 36.8082 5.29452 37.5834 6.26522 37.5834H30.8717C31.8425 37.5834 32.6293 36.8082 32.6293 35.8519V28.5797L39.8673 34.8984C40.0149 35.0002 40.1909 35.0549 40.3712 35.0549C40.8565 35.0549 41.25 34.6673 41.25 34.1892V13.274C41.25 13.0964 41.1945 12.923 41.0911 12.7775C40.8129 12.3858 40.2649 12.2905 39.8673 12.5647L32.6293 18.8834V11.6112C32.6293 10.6549 31.8425 9.87971 30.8717 9.87971H19.726C20.1146 10.9629 20.3261 12.1284 20.3261 13.3427Z" fill="currentColor" />
                </svg>
              </div>
              <h3 className="card-title">Create New Project</h3>
              <p className="card-subtitle">Quickly cut Interview and B-Roll selects</p>
            </div>
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
                  onClick={() => handleProjectClick(project)}
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
