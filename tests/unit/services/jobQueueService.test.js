const JobQueueService = require('../../services/jobQueueService');

describe('Job Queue Service', () => {
  let jobQueueService;
  
  beforeEach(() => {
    jobQueueService = new JobQueueService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('addJob', () => {
    it('should add job to queue successfully', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1, csvData: [] },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('type', 'document_generation');
      expect(job).toHaveProperty('status', 'queued');
      expect(job).toHaveProperty('createdAt');
      expect(jobQueueService.getQueueLength()).toBe(1);
    });
    
    it('should add high priority job at front of queue', async () => {
      // Add normal priority job first
      await jobQueueService.addJob({
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      });
      
      // Add high priority job
      await jobQueueService.addJob({
        type: 'urgent_document',
        data: { templateId: 2 },
        priority: 'high'
      });
      
      const queue = jobQueueService.getQueue();
      expect(queue[0].type).toBe('urgent_document');
      expect(queue[1].type).toBe('document_generation');
    });
    
    it('should validate job data before adding', async () => {
      const invalidJobData = {
        // Missing required fields
      };
      
      await expect(jobQueueService.addJob(invalidJobData)).rejects.toThrow();
    });
    
    it('should handle maximum queue size limit', async () => {
      // Fill queue to capacity
      const maxJobs = 100;
      for (let i = 0; i < maxJobs; i++) {
        await jobQueueService.addJob({
          type: 'test_job',
          data: { id: i },
          priority: 'normal'
        });
      }
      
      // Try to add one more job
      await expect(jobQueueService.addJob({
        type: 'overflow_job',
        data: { id: maxJobs + 1 },
        priority: 'normal'
      })).rejects.toThrow('Queue is full');
    });
  });
  
  describe('processJob', () => {
    it('should process job successfully', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1, csvData: [] },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      
      // Mock job processor
      const mockProcessor = jest.fn().mockResolvedValue({ success: true });
      jobQueueService.registerProcessor('document_generation', mockProcessor);
      
      const result = await jobQueueService.processJob(job.id);
      
      expect(result.success).toBe(true);
      expect(mockProcessor).toHaveBeenCalledWith(jobData.data);
      expect(job.status).toBe('completed');
    });
    
    it('should handle job processing errors', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1, csvData: [] },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      
      // Mock job processor that throws error
      const mockProcessor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      jobQueueService.registerProcessor('document_generation', mockProcessor);
      
      await expect(jobQueueService.processJob(job.id)).rejects.toThrow('Processing failed');
      expect(job.status).toBe('failed');
      expect(job.error).toBe('Processing failed');
    });
    
    it('should handle non-existent job', async () => {
      await expect(jobQueueService.processJob('non-existent-id')).rejects.toThrow('Job not found');
    });
    
    it('should handle already processed job', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      job.status = 'completed';
      
      await expect(jobQueueService.processJob(job.id)).rejects.toThrow('Job already processed');
    });
  });
  
  describe('processQueue', () => {
    it('should process all jobs in queue', async () => {
      // Add multiple jobs
      const job1 = await jobQueueService.addJob({
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      });
      
      const job2 = await jobQueueService.addJob({
        type: 'document_generation',
        data: { templateId: 2 },
        priority: 'normal'
      });
      
      // Mock job processor
      const mockProcessor = jest.fn().mockResolvedValue({ success: true });
      jobQueueService.registerProcessor('document_generation', mockProcessor);
      
      const results = await jobQueueService.processQueue();
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockProcessor).toHaveBeenCalledTimes(2);
    });
    
    it('should process jobs in priority order', async () => {
      // Add jobs with different priorities
      await jobQueueService.addJob({
        type: 'low_priority',
        data: { id: 1 },
        priority: 'low'
      });
      
      await jobQueueService.addJob({
        type: 'high_priority',
        data: { id: 2 },
        priority: 'high'
      });
      
      await jobQueueService.addJob({
        type: 'normal_priority',
        data: { id: 3 },
        priority: 'normal'
      });
      
      const mockProcessor = jest.fn().mockResolvedValue({ success: true });
      jobQueueService.registerProcessor('low_priority', mockProcessor);
      jobQueueService.registerProcessor('high_priority', mockProcessor);
      jobQueueService.registerProcessor('normal_priority', mockProcessor);
      
      const results = await jobQueueService.processQueue();
      
      expect(results).toHaveLength(3);
      expect(mockProcessor).toHaveBeenCalledTimes(3);
    });
    
    it('should handle partial failures gracefully', async () => {
      // Add multiple jobs
      await jobQueueService.addJob({
        type: 'success_job',
        data: { id: 1 },
        priority: 'normal'
      });
      
      await jobQueueService.addJob({
        type: 'failure_job',
        data: { id: 2 },
        priority: 'normal'
      });
      
      // Mock processors
      const successProcessor = jest.fn().mockResolvedValue({ success: true });
      const failureProcessor = jest.fn().mockRejectedValue(new Error('Job failed'));
      
      jobQueueService.registerProcessor('success_job', successProcessor);
      jobQueueService.registerProcessor('failure_job', failureProcessor);
      
      const results = await jobQueueService.processQueue();
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
  
  describe('getJob', () => {
    it('should retrieve job by ID', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const addedJob = await jobQueueService.addJob(jobData);
      const retrievedJob = jobQueueService.getJob(addedJob.id);
      
      expect(retrievedJob).toEqual(addedJob);
    });
    
    it('should return null for non-existent job', () => {
      const job = jobQueueService.getJob('non-existent-id');
      expect(job).toBeNull();
    });
  });
  
  describe('removeJob', () => {
    it('should remove job from queue', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      expect(jobQueueService.getQueueLength()).toBe(1);
      
      const removed = jobQueueService.removeJob(job.id);
      expect(removed).toBe(true);
      expect(jobQueueService.getQueueLength()).toBe(0);
    });
    
    it('should return false for non-existent job', () => {
      const removed = jobQueueService.removeJob('non-existent-id');
      expect(removed).toBe(false);
    });
    
    it('should not remove completed jobs', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      job.status = 'completed';
      
      const removed = jobQueueService.removeJob(job.id);
      expect(removed).toBe(false);
    });
  });
  
  describe('clearQueue', () => {
    it('should clear all jobs from queue', async () => {
      // Add multiple jobs
      await jobQueueService.addJob({
        type: 'job1',
        data: { id: 1 },
        priority: 'normal'
      });
      
      await jobQueueService.addJob({
        type: 'job2',
        data: { id: 2 },
        priority: 'high'
      });
      
      expect(jobQueueService.getQueueLength()).toBe(2);
      
      jobQueueService.clearQueue();
      
      expect(jobQueueService.getQueueLength()).toBe(0);
    });
    
    it('should clear only queued jobs', async () => {
      // Add jobs
      const job1 = await jobQueueService.addJob({
        type: 'queued_job',
        data: { id: 1 },
        priority: 'normal'
      });
      
      const job2 = await jobQueueService.addJob({
        type: 'completed_job',
        data: { id: 2 },
        priority: 'normal'
      });
      
      // Mark second job as completed
      job2.status = 'completed';
      
      jobQueueService.clearQueue();
      
      expect(jobQueueService.getQueueLength()).toBe(0);
      expect(jobQueueService.getJob(job1.id)).toBeNull();
      expect(jobQueueService.getJob(job2.id)).toBeNull();
    });
  });
  
  describe('getQueueStats', () => {
    it('should return accurate queue statistics', async () => {
      // Add jobs with different statuses
      await jobQueueService.addJob({
        type: 'job1',
        data: { id: 1 },
        priority: 'normal'
      });
      
      await jobQueueService.addJob({
        type: 'job2',
        data: { id: 2 },
        priority: 'high'
      });
      
      const job3 = await jobQueueService.addJob({
        type: 'job3',
        data: { id: 3 },
        priority: 'low'
      });
      
      // Mark one job as completed
      job3.status = 'completed';
      
      const stats = jobQueueService.getQueueStats();
      
      expect(stats.totalJobs).toBe(3);
      expect(stats.queuedJobs).toBe(2);
      expect(stats.completedJobs).toBe(1);
      expect(stats.failedJobs).toBe(0);
      expect(stats.processingJobs).toBe(0);
    });
    
    it('should return empty stats for empty queue', () => {
      const stats = jobQueueService.getQueueStats();
      
      expect(stats.totalJobs).toBe(0);
      expect(stats.queuedJobs).toBe(0);
      expect(stats.completedJobs).toBe(0);
      expect(stats.failedJobs).toBe(0);
      expect(stats.processingJobs).toBe(0);
    });
  });
  
  describe('retryFailedJob', () => {
    it('should retry failed job successfully', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      job.status = 'failed';
      job.error = 'Previous failure';
      
      const retried = jobQueueService.retryFailedJob(job.id);
      
      expect(retried).toBe(true);
      expect(job.status).toBe('queued');
      expect(job.error).toBeUndefined();
      expect(job.retryCount).toBe(1);
    });
    
    it('should not retry non-failed jobs', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      job.status = 'queued';
      
      const retried = jobQueueService.retryFailedJob(job.id);
      
      expect(retried).toBe(false);
      expect(job.status).toBe('queued');
    });
    
    it('should respect maximum retry limit', async () => {
      const jobData = {
        type: 'document_generation',
        data: { templateId: 1 },
        priority: 'normal'
      };
      
      const job = await jobQueueService.addJob(jobData);
      job.status = 'failed';
      job.retryCount = 3; // Max retries reached
      
      const retried = jobQueueService.retryFailedJob(job.id);
      
      expect(retried).toBe(false);
      expect(job.status).toBe('failed');
    });
  });
  
  describe('getJobsByType', () => {
    it('should return jobs filtered by type', async () => {
      // Add different types of jobs
      await jobQueueService.addJob({
        type: 'document_generation',
        data: { id: 1 },
        priority: 'normal'
      });
      
      await jobQueueService.addJob({
        type: 'email_notification',
        data: { id: 2 },
        priority: 'normal'
      });
      
      await jobQueueService.addJob({
        type: 'document_generation',
        data: { id: 3 },
        priority: 'high'
      });
      
      const documentJobs = jobQueueService.getJobsByType('document_generation');
      const emailJobs = jobQueueService.getJobsByType('email_notification');
      
      expect(documentJobs).toHaveLength(2);
      expect(emailJobs).toHaveLength(1);
      expect(documentJobs[0].type).toBe('document_generation');
      expect(emailJobs[0].type).toBe('email_notification');
    });
    
    it('should return empty array for non-existent type', () => {
      const jobs = jobQueueService.getJobsByType('non_existent_type');
      expect(jobs).toEqual([]);
    });
  });
  
  describe('getJobsByStatus', () => {
    it('should return jobs filtered by status', async () => {
      // Add jobs
      const job1 = await jobQueueService.addJob({
        type: 'job1',
        data: { id: 1 },
        priority: 'normal'
      });
      
      const job2 = await jobQueueService.addJob({
        type: 'job2',
        data: { id: 2 },
        priority: 'normal'
      });
      
      // Mark one job as completed
      job2.status = 'completed';
      
      const queuedJobs = jobQueueService.getJobsByStatus('queued');
      const completedJobs = jobQueueService.getJobsByStatus('completed');
      
      expect(queuedJobs).toHaveLength(1);
      expect(completedJobs).toHaveLength(1);
      expect(queuedJobs[0].status).toBe('queued');
      expect(completedJobs[0].status).toBe('completed');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle job processor registration errors', () => {
      expect(() => {
        jobQueueService.registerProcessor('', jest.fn())
      }).toThrow('Job type cannot be empty');
      
      expect(() => {
        jobQueueService.registerProcessor('test_type', null)
      }).toThrow('Processor must be a function');
    });
    
    it('should handle invalid job priorities', async () => {
      await expect(jobQueueService.addJob({
        type: 'test_job',
        data: { id: 1 },
        priority: 'invalid_priority'
      })).rejects.toThrow('Invalid priority level');
    });
    
    it('should handle circular job dependencies', async () => {
      const job1 = await jobQueueService.addJob({
        type: 'job1',
        data: { id: 1, dependsOn: 'job2' },
        priority: 'normal'
      });
      
      const job2 = await jobQueueService.addJob({
        type: 'job2',
        data: { id: 2, dependsOn: 'job1' },
        priority: 'normal'
      });
      
      await expect(jobQueueService.processJob(job1.id)).rejects.toThrow('Circular dependency detected');
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large number of jobs efficiently', async () => {
      const startTime = Date.now();
      
      // Add 1000 jobs
      const promises = Array.from({ length: 1000 }, (_, i) => 
        jobQueueService.addJob({
          type: 'test_job',
          data: { id: i },
          priority: 'normal'
        })
      );
      
      await Promise.all(promises);
      const endTime = Date.now();
      
      expect(jobQueueService.getQueueLength()).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should process jobs concurrently efficiently', async () => {
      // Add 100 jobs
      for (let i = 0; i < 100; i++) {
        await jobQueueService.addJob({
          type: 'test_job',
          data: { id: i },
          priority: 'normal'
        });
      }
      
      // Mock processor
      const mockProcessor = jest.fn().mockResolvedValue({ success: true });
      jobQueueService.registerProcessor('test_job', mockProcessor);
      
      const startTime = Date.now();
      const results = await jobQueueService.processQueue();
      const endTime = Date.now();
      
      expect(results).toHaveLength(100);
      expect(mockProcessor).toHaveBeenCalledTimes(100);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
