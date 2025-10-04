import { useState } from 'react'
import './Research.css'

function Research() {
  const [activeTab, setActiveTab] = useState('current')

  const currentProjects = [
    {
      id: 1,
      title: 'Sample Research Project 1',
      description: 'This is a placeholder for your current research project. Replace this with your actual research description.',
      status: 'In Progress',
      startDate: '2024'
    },
    {
      id: 2,
      title: 'Sample Research Project 2',
      description: 'Another placeholder for ongoing research. Add details about methodology, objectives, and expected outcomes.',
      status: 'In Progress',
      startDate: '2024'
    }
  ]

  const pastProjects = [
    {
      id: 3,
      title: 'Completed Research Project',
      description: 'A placeholder for completed research. Include findings, publications, or outcomes here.',
      status: 'Completed',
      completionDate: '2023'
    }
  ]

  const publications = [
    {
      id: 1,
      title: 'Sample Publication Title',
      authors: 'Your Name, et al.',
      venue: 'Journal/Conference Name',
      year: '2023',
      link: '#'
    }
  ]

  return (
    <div className="research">
      <header className="research-header">
        <h1>Research & Projects</h1>
        <p>Exploring theoretical and applied work in mathematics and philosophy</p>
      </header>

      <div className="tabs">
        <button 
          className={activeTab === 'current' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('current')}
        >
          Current Projects
        </button>
        <button 
          className={activeTab === 'past' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('past')}
        >
          Past Projects
        </button>
        <button 
          className={activeTab === 'publications' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('publications')}
        >
          Publications
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'current' && (
          <div className="projects-grid">
            {currentProjects.map(project => (
              <div key={project.id} className="project-card">
                <div className="project-status">{project.status}</div>
                <h3>{project.title}</h3>
                <p className="project-date">Started: {project.startDate}</p>
                <p>{project.description}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'past' && (
          <div className="projects-grid">
            {pastProjects.map(project => (
              <div key={project.id} className="project-card">
                <div className="project-status completed">{project.status}</div>
                <h3>{project.title}</h3>
                <p className="project-date">Completed: {project.completionDate}</p>
                <p>{project.description}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'publications' && (
          <div className="publications-list">
            {publications.map(pub => (
              <div key={pub.id} className="publication-item">
                <h3>{pub.title}</h3>
                <p className="pub-authors">{pub.authors}</p>
                <p className="pub-venue">{pub.venue}, {pub.year}</p>
                {pub.link !== '#' && (
                  <a href={pub.link} target="_blank" rel="noopener noreferrer" className="pub-link">
                    View Publication →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Research
