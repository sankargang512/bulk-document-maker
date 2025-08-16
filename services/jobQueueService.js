const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class JobQueueService extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.processingQueue = [];
    this.isProcessing = false;
    this.maxConcurrentJobs = 3;
    this.activeJobs = 0;
    this.jobsDir = path.join(__dirname, '../temp/jobs');
    
    this.init();
  }

  async init() {
    try {
      await fs.ensureDir(this.jobsDir);
      await this.loadPersistedJobs();
      this.startQueueProcessor();
      console.log('Job queue service initialized');
    } catch (error) {
      console.error('Failed to initialize job queue service:', error);
    }
  }

  // Create a new job
  async createJob(jobData) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'pending',
      progress: 0,
      data: jobData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      priority: jobData.priority || 'normal'
    };

    this.jobs.set(jobId, job);
    await this.persistJob(job);
    
    // Add to processing queue
    this.addToQueue(job);
    
    this.emit('jobCreated', job);
    return job;
  }

  // Add job to processing queue
  addToQueue(job) {
    if (job.priority === 'high') {
      this.processingQueue.unshift(job);
    } else {
      this.processingQueue.push(job);
    }
    
    this.processQueue();
  }

  // Process the job queue
  async processQueue() {
    if (this.isProcessing || this.activeJobs >= this.maxConcurrentJobs) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0 && this.activeJobs < this.maxConcurrentJobs) {
      const job = this.processingQueue.shift();
      if (job && job.status === 'pending') {
        this.activeJobs++;
        this.processJob(job);
      }
    }

    this.isProcessing = false;
  }

  // Process a single job
  async processJob(job) {
    try {
      this.updateJobStatus(job.id, 'processing', 0);
      job.startedAt = new Date().toISOString();
      
      this.emit('jobStarted', job);

      // Simulate job processing (replace with actual document generation)
      await this.simulateJobProcessing(job);

      this.updateJobStatus(job.id, 'completed', 100);
      job.completedAt = new Date().toISOString();
      
      this.emit('jobCompleted', job);

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        job.status = 'pending';
        job.error = error.message;
        job.updatedAt = new Date().toISOString();
        
        // Add back to queue with delay
        setTimeout(() => {
          this.addToQueue(job);
        }, Math.pow(2, job.retryCount) * 1000); // Exponential backoff
        
        this.emit('jobRetrying', job);
      } else {
        this.updateJobStatus(job.id, 'failed', job.progress, error.message);
        this.emit('jobFailed', job);
      }
    } finally {
      this.activeJobs--;
      this.processQueue(); // Process next job
    }
  }

  // Simulate job processing (replace with actual logic)
  async simulateJobProcessing(job) {
    const totalSteps = 5;
    
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
      
      const progress = (i / totalSteps) * 100;
      this.updateJobProgress(job.id, progress);
      
      // Simulate potential failure
      if (Math.random() < 0.1) { // 10% chance of failure
        throw new Error('Simulated processing error');
      }
    }
  }

  // Update job status
  updateJobStatus(jobId, status, progress = null, error = null) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (progress !== null) job.progress = progress;
      if (error !== null) job.error = error;
      job.updatedAt = new Date().toISOString();
      
      this.persistJob(job);
      this.emit('jobUpdated', job);
    }
  }

  // Update job progress
  updateJobProgress(jobId, progress) {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'processing') {
      job.progress = Math.min(100, Math.max(0, progress));
      job.updatedAt = new Date().toISOString();
      
      this.persistJob(job);
      this.emit('jobProgress', job);
    }
  }

  // Get job by ID
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  // Get all jobs
  getAllJobs(options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    let jobs = Array.from(this.jobs.values());
    
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    // Sort by creation date (newest first)
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return {
      jobs: jobs.slice(offset, offset + limit),
      total: jobs.length,
      limit,
      offset
    };
  }

  // Cancel a job
  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'pending') {
      // Remove from queue
      this.processingQueue = this.processingQueue.filter(j => j.id !== jobId);
      
      this.updateJobStatus(jobId, 'cancelled');
      this.emit('jobCancelled', job);
      
      return { success: true, message: 'Job cancelled successfully' };
    }
    
    return { success: false, message: 'Job cannot be cancelled' };
  }

  // Retry a failed job
  async retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'failed') {
      job.status = 'pending';
      job.error = null;
      job.retryCount = 0;
      job.updatedAt = new Date().toISOString();
      
      this.persistJob(job);
      this.addToQueue(job);
      
      this.emit('jobRetrying', job);
      return { success: true, message: 'Job queued for retry' };
    }
    
    return { success: false, message: 'Job cannot be retried' };
  }

  // Delete a job
  async deleteJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      // Remove from queue
      this.processingQueue = this.processingQueue.filter(j => j.id !== jobId);
      
      // Remove from active jobs
      this.jobs.delete(jobId);
      
      // Clean up job files
      await this.cleanupJobFiles(jobId);
      
      this.emit('jobDeleted', job);
      return { success: true, message: 'Job deleted successfully' };
    }
    
    return { success: false, message: 'Job not found' };
  }

  // Clean up job files
  async cleanupJobFiles(jobId) {
    try {
      const jobDir = path.join(this.jobsDir, jobId);
      if (await fs.pathExists(jobDir)) {
        await fs.remove(jobDir);
      }
    } catch (error) {
      console.error(`Failed to cleanup job files for ${jobId}:`, error);
    }
  }

  // Get queue statistics
  getQueueStats() {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      activeJobs: this.activeJobs,
      queueLength: this.processingQueue.length,
      maxConcurrent: this.maxConcurrentJobs
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  // Persist job to disk
  async persistJob(job) {
    try {
      const jobFile = path.join(this.jobsDir, `${job.id}.json`);
      await fs.writeFile(jobFile, JSON.stringify(job, null, 2));
    } catch (error) {
      console.error(`Failed to persist job ${job.id}:`, error);
    }
  }

  // Load persisted jobs from disk
  async loadPersistedJobs() {
    try {
      if (!(await fs.pathExists(this.jobsDir))) {
        return;
      }

      const files = await fs.readdir(this.jobsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const jobPath = path.join(this.jobsDir, file);
            const jobData = await fs.readFile(jobPath, 'utf8');
            const job = JSON.parse(jobData);
            
            // Only load jobs that aren't completed/failed
            if (['pending', 'processing'].includes(job.status)) {
              this.jobs.set(job.id, job);
              if (job.status === 'pending') {
                this.addToQueue(job);
              }
            }
          } catch (error) {
            console.error(`Failed to load job from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load persisted jobs:', error);
    }
  }

  // Start the queue processor
  startQueueProcessor() {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  // Clean up old completed jobs
  async cleanupOldJobs(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const cutoff = new Date(Date.now() - maxAge);
      
      for (const [jobId, job] of this.jobs.entries()) {
        if (job.status === 'completed' && new Date(job.completedAt) < cutoff) {
          await this.deleteJob(jobId);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old jobs:', error);
    }
  }

  // Set max concurrent jobs
  setMaxConcurrentJobs(max) {
    this.maxConcurrentJobs = Math.max(1, max);
    this.processQueue(); // Process queue with new limit
  }

  // Get job logs
  async getJobLogs(jobId, options = {}) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const logsDir = path.join(this.jobsDir, jobId, 'logs');
      if (!(await fs.pathExists(logsDir))) {
        return [];
      }

      const logFiles = await fs.readdir(logsDir);
      let allLogs = [];

      for (const file of logFiles) {
        if (file.endsWith('.log')) {
          const logPath = path.join(logsDir, file);
          const logContent = await fs.readFile(logPath, 'utf8');
          const logs = logContent.split('\n').filter(line => line.trim());
          
          allLogs = allLogs.concat(logs.map(log => {
            try {
              return JSON.parse(log);
            } catch {
              return { message: log, timestamp: new Date().toISOString() };
            }
          }));
        }
      }

      // Sort by timestamp
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Apply pagination
      const { page = 1, limit = 100 } = options;
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        logs: allLogs.slice(start, end),
        total: allLogs.length,
        page,
        limit
      };
    } catch (error) {
      throw new Error(`Failed to get job logs: ${error.message}`);
    }
  }

  // Add log entry to job
  async addJobLog(jobId, level, message, data = {}) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return;
      }

      const logsDir = path.join(this.jobsDir, jobId, 'logs');
      await fs.ensureDir(logsDir);

      const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data
      };

      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error(`Failed to add log entry for job ${jobId}:`, error);
    }
  }
}

module.exports = new JobQueueService();

